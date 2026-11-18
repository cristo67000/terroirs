'use strict';
/*
 * La carte des vignobles, dessinée sur place : aucune tuile, aucun serveur.
 *
 * De loin, l'emprise de chaque région viticole ; en s'approchant, les aires
 * d'appellation (délimitation parcellaire de l'INAO, simplifiée), des plus
 * vastes aux plus petites, puis les premiers crus et les dénominations. On
 * touche la carte : la liste des appellations présentes à cet endroit
 * s'affiche dessous, de la plus précise à la plus générale.
 *
 * Tout est en coordonnées « monde » (projection de Mercator, 0 à K) ; les
 * tracés sont des Path2D construits une fois, que le canevas transforme à
 * chaque image : déplacer ou zoomer ne recalcule rien.
 */
(function (racine) {

  const { element, bouton } = Outils;
  const K = 1e6;
  const Z_APPELLATIONS = 6.7;    // en deçà : les régions ; au-delà : les appellations
  const Z_DENOMINATIONS = 9.6;
  const Z_MIN = 4.2;
  const Z_MAX = 14.6;

  const TEINTES = {
    alsace: 95, beaujolais: 318, bordeaux: 345, bourgogne: 12, champagne: 46, corse: 222, jura: 62,
    languedoc: 28, loire: 152, provence: 300, rhone: 268, roussillon: 2, 'savoie-bugey': 185, 'sud-ouest': 205,
  };

  let fond = null;
  let pret = false;
  let enCours = false;
  const regions = new Map();      // id -> { etat, appellations, denominations }
  const tracesRegion = new Map(); // id -> Path2D de l'emprise
  let toile = null;
  let ctx = null;
  let largeur = 0;
  let hauteur = 0;
  let dpr = 1;
  let cx = 0;
  let cy = 0;
  let ech = 0;                    // pixels par unité monde
  let selection = null;           // { t: 'a' | 'r', id }
  let enAttente = null;           // ce qu'il faudra montrer une fois la carte prête
  let image = 0;
  let animation = null;
  let couleurs = {};
  let sombre = false;

  /* ————— projection ————— */

  const mx = (lon) => (lon + 180) / 360 * K;
  function my(lat) {
    const s = Math.sin(lat * Math.PI / 180);
    return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * K;
  }
  const zoom = () => Math.log2(ech * K / 256);
  const echDe = (z) => 256 * Math.pow(2, z) / K;

  /* Polygones codés ([x0, y0, dx, dy…] en degrés × diviseur) → Path2D. */
  function tracer(polygones, diviseur) {
    const chemin = new Path2D();
    for (const polygone of polygones || []) {
      for (const anneau of polygone) {
        let x = 0;
        let y = 0;
        for (let i = 0; i < anneau.length; i += 2) {
          x += anneau[i];
          y += anneau[i + 1];
          const X = mx(x / diviseur);
          const Y = my(y / diviseur);
          if (i === 0) chemin.moveTo(X, Y); else chemin.lineTo(X, Y);
        }
        chemin.closePath();
      }
    }
    return chemin;
  }

  function tracerLignes(lignes, diviseur) {
    const chemin = new Path2D();
    const points = [];
    for (const ligne of lignes) {
      let x = 0;
      let y = 0;
      for (let i = 0; i < ligne.length; i += 2) {
        x += ligne[i];
        y += ligne[i + 1];
        const X = mx(x / diviseur);
        const Y = my(y / diviseur);
        if (i === 0) chemin.moveTo(X, Y); else chemin.lineTo(X, Y);
        points.push(X, Y);
      }
    }
    return { chemin, points };
  }

  /* Une boîte [ouest, sud, est, nord] en degrés → en monde [x0, y0, x1, y1]. */
  const boite = (b) => [mx(b[0]), my(b[3]), mx(b[2]), my(b[1])];

  function vue() {
    const dx = largeur / 2 / ech;
    const dy = hauteur / 2 / ech;
    return [cx - dx, cy - dy, cx + dx, cy + dy];
  }
  const croise = (a, b) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];

  /* ————— chargement ————— */

  async function chargerFond() {
    const reponse = await fetch('data/carte/fond.json');
    if (!reponse.ok) throw new Error('carte : ' + reponse.status);
    fond = await reponse.json();
    fond.terre = new Path2D();
    for (const d of fond.departements) { d.chemin = tracer(d.g, 10000); fond.terre.addPath(d.chemin); delete d.g; }
    fond.voisine = new Path2D();
    for (const v of fond.voisins) fond.voisine.addPath(tracer(v.g, 10000));
    fond.lac = tracer(fond.lacs, 10000);
    for (const f of fond.fleuves) Object.assign(f, tracerLignes(f.l, 10000));
    for (const id of Object.keys(fond.regions)) {
      const r = fond.regions[id];
      tracesRegion.set(id, tracer(r.g, 10000));
      r.bm = boite(r.b);
      r.cm = [mx(r.c[0]), my(r.c[1])];
    }
    for (const v of fond.villes) { v[4] = mx(v[1]); v[5] = my(v[2]); }
  }

  function chargerRegion(id) {
    if (regions.has(id)) return regions.get(id).promesse;
    const r = { etat: 'attente', appellations: [], denominations: [] };
    regions.set(id, r);
    majAttente();
    r.promesse = fetch('data/carte/' + id + '.json').then((rep) => {
      if (!rep.ok) throw new Error(String(rep.status));
      return rep.json();
    }).then((donnees) => {
      const parId = new Map();
      for (const a of donnees.appellations) {
        a.bm = boite(a.b);
        a.cm = [mx(a.c[0]), my(a.c[1])];
        a.fiche = Guide.get('a', a.id);
        a.region = id;
        if (a.g) { a.chemin = tracer(a.g, 100000); delete a.g; }
        parId.set(a.id, a);
      }
      for (const a of donnees.appellations) {
        if (a.meme && parId.get(a.meme)) { a.chemin = parId.get(a.meme).chemin; a.jumelle = true; }
        a.couleur = teinte(id, a.id);
      }
      for (const d of donnees.denominations) {
        d.bm = boite(d.b);
        d.cm = [mx(d.c[0]), my(d.c[1])];
        d.chemin = tracer(d.g, 100000);
        d.mere = parId.get(d.de);
        delete d.g;
      }
      r.appellations = donnees.appellations.filter((a) => a.chemin && a.fiche);
      r.denominations = donnees.denominations.filter((d) => d.mere);
      r.parId = parId;
      r.etat = 'pret';
    }).catch(() => { r.etat = 'echec'; }).then(() => { majAttente(); demander(); });
    return r.promesse;
  }

  function majAttente() {
    const attente = document.getElementById('carte-attente');
    if (attente) attente.hidden = !Array.from(regions.values()).some((r) => r.etat === 'attente');
  }

  /* Une teinte par appellation : celle de sa région, un peu décalée pour que
   * deux voisines ne se confondent pas. */
  function teinte(regionId, id) {
    let h = 0;
    for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return { t: (TEINTES[regionId] || 0) + ((h % 7) - 3) * 8, l: (h >> 4) % 3 };
  }
  function hsl(c, alpha) {
    const l = (sombre ? 58 : 40) + c.l * 7;
    return 'hsla(' + c.t + ',' + (sombre ? 55 : 60) + '%,' + l + '%,' + alpha + ')';
  }
  function hslRegion(id, alpha) {
    return 'hsla(' + (TEINTES[id] || 0) + ',' + (sombre ? 55 : 58) + '%,' + (sombre ? 60 : 42) + '%,' + alpha + ')';
  }

  function lireCouleurs() {
    const s = getComputedStyle(document.documentElement);
    const v = (nom) => s.getPropertyValue(nom).trim();
    couleurs = {
      mer: v('--mer'), terre: v('--terre'), voisine: v('--terre-voisine'), frontiere: v('--frontiere'),
      eau: v('--eau'), eauNom: v('--eau-nom'), bourg: v('--bourg'), halo: v('--halo'), encre: v('--encre'),
      accent: v('--accent'), sans: v('--sans'), serif: v('--serif'),
    };
    sombre = s.colorScheme.includes('dark') && !s.colorScheme.includes('light');
  }

  /* ————— dessin ————— */

  function demander() {
    if (image || !pret) return;
    image = requestAnimationFrame(() => { image = 0; dessiner(); });
  }

  function visibles() {
    const v = vue();
    const sortie = [];
    for (const id of Object.keys(fond.regions)) {
      if (!croise(fond.regions[id].bm, v)) continue;
      const r = regions.get(id);
      if (!r) { chargerRegion(id); continue; }
      if (r.etat === 'pret') sortie.push(r);
    }
    return sortie;
  }

  function dessiner() {
    if (!ctx || !largeur) return;
    const z = zoom();
    const v = vue();
    const trait = (px) => px / ech;       // une épaisseur d'écran, en unités monde

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = couleurs.mer;
    ctx.fillRect(0, 0, largeur, hauteur);
    ctx.setTransform(dpr * ech, 0, 0, dpr * ech, dpr * (largeur / 2 - cx * ech), dpr * (hauteur / 2 - cy * ech));
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    ctx.fillStyle = couleurs.voisine;
    ctx.fill(fond.voisine, 'evenodd');
    ctx.fillStyle = couleurs.terre;
    ctx.fill(fond.terre, 'evenodd');
    ctx.strokeStyle = couleurs.frontiere;
    ctx.lineWidth = trait(z < 6 ? 0.5 : 0.8);
    ctx.stroke(fond.terre);

    ctx.strokeStyle = couleurs.eau;
    for (const f of fond.fleuves) {
      if (f.rang > 9 && z < 5.6) continue;
      if (z > 10.8) break;   // tracé trop sommaire pour être montré de si près
      ctx.lineWidth = trait((f.rang <= 6 ? 1.6 : (f.rang <= 9 ? 1.2 : 0.8)) * (z > 8 ? 1.6 : 1));
      ctx.stroke(f.chemin);
    }
    ctx.fillStyle = couleurs.mer;
    ctx.fill(fond.lac, 'evenodd');

    const detail = z >= Z_APPELLATIONS;
    const etiquettes = [];
    const dansVue = detail ? visibles() : [];
    const pretes = new Set(dansVue.map((r) => r));

    // les emprises : seules, de loin ; en attendant le détail, de près
    for (const id of Object.keys(fond.regions)) {
      const r = fond.regions[id];
      if (!croise(r.bm, v)) continue;
      const charge = regions.get(id);
      if (detail && charge && charge.etat === 'pret' && pretes.has(charge)) continue;
      ctx.fillStyle = hslRegion(id, detail ? 0.3 : 0.62);
      ctx.fill(tracesRegion.get(id), 'evenodd');
      if (!detail) {
        ctx.strokeStyle = hslRegion(id, 0.9);
        ctx.lineWidth = trait(selection && selection.t === 'r' && selection.id === id ? 2 : 0.6);
        ctx.stroke(tracesRegion.get(id));
      }
    }

    if (detail) {
      for (const r of dansVue) {
        for (const a of r.appellations) {
          if (a.jumelle || !croise(a.bm, v)) continue;
          ctx.fillStyle = hsl(a.couleur, a.nappe ? 0.15 : (a.com ? 0.28 : 0.5));
          ctx.fill(a.chemin, 'evenodd');
          if (!a.nappe || (z > 8.5 && z < 10.5)) {
            ctx.strokeStyle = hsl(a.couleur, a.nappe ? 0.35 : 0.85);
            ctx.lineWidth = trait(0.7);
            ctx.stroke(a.chemin);
          }
        }
        if (z >= Z_DENOMINATIONS) {
          for (const d of r.denominations) {
            if (!croise(d.bm, v)) continue;
            if (d.pc) {
              ctx.fillStyle = hsl(d.mere.couleur, 0.45);
              ctx.fill(d.chemin, 'evenodd');
              ctx.strokeStyle = hsl(d.mere.couleur, 1);
              ctx.lineWidth = trait(1);
              ctx.stroke(d.chemin);
            } else if (d.mere.nappe && d.ha > 3000) {
              // les grandes dénominations régionales (Hautes Côtes…) : un voile, sans contour
              ctx.fillStyle = hsl(d.mere.couleur, 0.1);
              ctx.fill(d.chemin, 'evenodd');
            } else {
              ctx.setLineDash([trait(4), trait(3)]);
              ctx.strokeStyle = sombre ? 'rgba(255,255,255,.75)' : 'rgba(40,20,25,.7)';
              ctx.lineWidth = trait(1);
              ctx.stroke(d.chemin);
              ctx.setLineDash([]);
            }
          }
        }
      }
    }

    // la sélection, par-dessus tout
    const choisie = selection && selection.t === 'a' ? appellationChargee(selection.id) : null;
    if (choisie && choisie.chemin) {
      ctx.strokeStyle = couleurs.halo;
      ctx.lineWidth = trait(5);
      ctx.stroke(choisie.chemin);
      ctx.strokeStyle = couleurs.accent;
      ctx.lineWidth = trait(2.4);
      ctx.stroke(choisie.chemin);
    }

    /* ——— les noms, en pixels d'écran ——— */
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const X = (x) => (x - cx) * ech + largeur / 2;
    const Y = (y) => (y - cy) * ech + hauteur / 2;
    const pris = [];
    const libre = (x0, y0, x1, y1) => {
      for (const p of pris) if (x0 < p[2] && x1 > p[0] && y0 < p[3] && y1 > p[1]) return false;
      pris.push([x0, y0, x1, y1]);
      return true;
    };
    const ecrire = (texte, x, y, police, couleur, options) => {
      const o = options || {};
      ctx.font = police;
      const l = ctx.measureText(texte).width;
      const h = o.h || 14;
      const x0 = o.gauche ? x : x - l / 2;
      if (x0 < 2 || x0 + l > largeur - 2 || y - h < 2 || y + 4 > hauteur - 2) return false;
      if (!o.force && !libre(x0 - 3, y - h, x0 + l + 3, y + 4)) return false;
      if (o.force) pris.push([x0 - 3, y - h, x0 + l + 3, y + 4]);
      ctx.lineWidth = 3.2;
      ctx.strokeStyle = couleurs.halo;
      ctx.lineJoin = 'round';
      ctx.strokeText(texte, x0, y);
      ctx.fillStyle = couleur;
      ctx.fillText(texte, x0, y);
      return true;
    };

    if (choisie) {
      ecrire(choisie.fiche.nom, X(choisie.cm[0]), Y(choisie.cm[1]) + 5, '700 14px ' + couleurs.sans, couleurs.accent, { force: true, h: 16 });
    }

    // les villes
    for (const ville of fond.villes) {
      const rang = ville[3];
      if ((rang === 2 && z < 6.2) || (rang === 3 && z < 8.7)) continue;
      const x = X(ville[4]);
      const y = Y(ville[5]);
      if (x < -20 || x > largeur + 20 || y < -20 || y > hauteur + 20) continue;
      const taille = rang === 1 ? 13 : (rang === 2 ? 12 : 11);
      ctx.font = (rang === 1 ? '600 ' : '500 ') + taille + 'px ' + couleurs.sans;
      const l = ctx.measureText(ville[0]).width;
      if (!libre(x - 4, y - 8, x + 8 + l, y + 7)) continue;
      ctx.beginPath();
      ctx.arc(x, y, rang === 1 ? 3 : 2.2, 0, 2 * Math.PI);
      ctx.fillStyle = couleurs.bourg;
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = couleurs.halo;
      ctx.stroke();
      ctx.lineWidth = 3;
      ctx.strokeText(ville[0], x + 6, y + 4);
      ctx.fillStyle = couleurs.bourg;
      ctx.fillText(ville[0], x + 6, y + 4);
    }

    if (!detail) {
      for (const id of Object.keys(fond.regions)) {
        const r = fond.regions[id];
        const fiche = Guide.get('r', id);
        if (!fiche || !croise(r.bm, v)) continue;
        ecrire(fiche.nom, X(r.cm[0]), Y(r.cm[1]) + 5, 'italic 700 ' + (z > 5.6 ? 15 : 13) + 'px ' + couleurs.serif, hslRegion(id, 1).replace(/,\d+%\)/, ',' + (sombre ? 78 : 26) + '%)').replace('hsla', 'hsl').replace(/,1\)$/, ')'), { h: 16 });
      }
    } else {
      const candidates = [];
      for (const r of dansVue) {
        for (const a of r.appellations) {
          if (a.jumelle || !croise(a.bm, v) || a === choisie) continue;
          const l = (a.bm[2] - a.bm[0]) * ech;
          const h = (a.bm[3] - a.bm[1]) * ech;
          if (Math.max(l, h) < 44 || Math.max(l, h) > 2.4 * Math.max(largeur, hauteur)) continue;
          candidates.push(a);
        }
      }
      candidates.sort((x, y) => x.ha - y.ha);
      for (const a of candidates) {
        ecrire(a.fiche.nom, X(a.cm[0]), Y(a.cm[1]) + 4,
          (a.nappe ? 'italic 500 12px ' : '600 12px ') + couleurs.sans,
          'hsl(' + a.couleur.t + ',' + (sombre ? '60%,82%' : '65%,22%') + ')');
      }
      if (z >= Z_DENOMINATIONS + 0.6) {
        for (const r of dansVue) {
          for (const d of r.denominations) {
            if (!croise(d.bm, v)) continue;
            const l = (d.bm[2] - d.bm[0]) * ech;
            if (l < 50) continue;
            const nom = d.pc ? 'premiers crus' : d.nom.replace(d.mere.fiche.nom + ' ', '');
            ecrire(nom, X(d.cm[0]), Y(d.cm[1]) + 4, 'italic 500 11px ' + couleurs.sans, couleurs.encre, { h: 12 });
          }
        }
      }
    }

    // les fleuves : leur nom, près du centre de l'écran
    for (const f of fond.fleuves) {
      if (!f.nom || z > 10.8 || (f.rang > 9 && z < 7.5) || (f.rang > 6 && z < 5.5)) continue;
      let mieux = null;
      let dMieux = Infinity;
      for (let i = 0; i < f.points.length; i += 2) {
        const x = X(f.points[i]);
        const y = Y(f.points[i + 1]);
        if (x < 40 || x > largeur - 40 || y < 30 || y > hauteur - 30) continue;
        const d = (x - largeur / 2) * (x - largeur / 2) + (y - hauteur / 2) * (y - hauteur / 2);
        if (d < dMieux) { dMieux = d; mieux = [x, y]; }
      }
      if (mieux) ecrire(f.nom, mieux[0], mieux[1] - 4, 'italic 500 11.5px ' + couleurs.serif, couleurs.eauNom, { h: 12 });
    }
  }

  function appellationChargee(id) {
    for (const r of regions.values()) {
      if (r.etat === 'pret' && r.parId.has(id)) return r.parId.get(id);
    }
    return null;
  }

  /* ————— déplacements ————— */

  function borner() {
    ech = Math.min(echDe(Z_MAX), Math.max(echDe(Z_MIN), ech));
    const c = fond.cadre;
    cx = Math.min(mx(c[2]), Math.max(mx(c[0]), cx));
    cy = Math.min(my(c[1]), Math.max(my(c[3]), cy));
  }

  function allerA(nx, ny, nech, anime) {
    if (animation) cancelAnimationFrame(animation);
    if (!anime || !largeur) { cx = nx; cy = ny; ech = nech; borner(); demander(); return; }
    const depart = { cx, cy, l: Math.log(ech) };
    const but = { cx: nx, cy: ny, l: Math.log(nech) };
    const t0 = performance.now();
    const pas = (t) => {
      const k = Math.min(1, (t - t0) / 450);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      cx = depart.cx + (but.cx - depart.cx) * e;
      cy = depart.cy + (but.cy - depart.cy) * e;
      ech = Math.exp(depart.l + (but.l - depart.l) * e);
      borner();
      dessiner();
      animation = k < 1 ? requestAnimationFrame(pas) : null;
    };
    animation = requestAnimationFrame(pas);
  }

  function cadrer(bm, anime, zMax) {
    const marge = 28;
    const l = Math.max(1e-6, bm[2] - bm[0]);
    const h = Math.max(1e-6, bm[3] - bm[1]);
    let e = Math.min((largeur - 2 * marge) / l, (hauteur - 2 * marge) / h);
    e = Math.min(e, echDe(zMax || 13.5));
    allerA((bm[0] + bm[2]) / 2, (bm[1] + bm[3]) / 2, e, anime);
  }

  function france(anime) {
    selection = null;
    cadrer(boite([-4.9, 41.3, 9.7, 51.1]), anime);
    ici(null);
    marquerRegion(null);
  }

  function zoomer(facteur, x, y) {
    const px = x === undefined ? largeur / 2 : x;
    const py = y === undefined ? hauteur / 2 : y;
    const wx = cx + (px - largeur / 2) / ech;
    const wy = cy + (py - hauteur / 2) / ech;
    const nech = Math.min(echDe(Z_MAX), Math.max(echDe(Z_MIN), ech * facteur));
    cx = wx - (px - largeur / 2) / nech;
    cy = wy - (py - hauteur / 2) / nech;
    ech = nech;
    borner();
    demander();
  }

  /* ————— toucher ————— */

  function toucher(px, py) {
    const wx = cx + (px - largeur / 2) / ech;
    const wy = cy + (py - hauteur / 2) / ech;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const dedans = (chemin) => ctx.isPointInPath(chemin, wx, wy, 'evenodd');

    if (zoom() < Z_APPELLATIONS) {
      // de loin : la région la plus proche du doigt
      let choisi = null;
      let dMin = Infinity;
      for (const id of Object.keys(fond.regions)) {
        const r = fond.regions[id];
        const marge = 14 / ech;
        if (wx < r.bm[0] - marge || wx > r.bm[2] + marge || wy < r.bm[1] - marge || wy > r.bm[3] + marge) continue;
        const d = dedans(tracesRegion.get(id)) ? 0 : Math.hypot(wx - r.cm[0], wy - r.cm[1]);
        if (d < dMin) { dMin = d; choisi = id; }
      }
      if (choisi) montrerRegion(choisi, true);
      return;
    }

    const trouvees = [];
    const denoms = [];
    for (const r of regions.values()) {
      if (r.etat !== 'pret') continue;
      for (const a of r.appellations) {
        if (wx < a.bm[0] || wx > a.bm[2] || wy < a.bm[1] || wy > a.bm[3]) continue;
        if (dedans(a.chemin)) trouvees.push(a);
      }
      for (const d of r.denominations) {
        if (wx < d.bm[0] || wx > d.bm[2] || wy < d.bm[1] || wy > d.bm[3]) continue;
        if (dedans(d.chemin)) denoms.push(d);
      }
    }
    trouvees.sort((x, y) => x.ha - y.ha);
    selection = trouvees.length ? { t: 'a', id: trouvees[0].id } : null;
    ici(trouvees, denoms);
    demander();
  }

  function ici(appellations, denoms) {
    const zone = document.getElementById('carte-ici');
    zone.textContent = '';
    if (appellations === null) {
      zone.appendChild(element('p', 'discret', 'Touchez une région pour vous en approcher, puis la carte pour savoir quelles appellations se trouvent à cet endroit.'));
      return;
    }
    if (!appellations.length) {
      zone.appendChild(element('p', 'discret', 'Pas de vigne d’appellation à cet endroit.'));
      return;
    }
    zone.appendChild(Rendu.titre('Ici, on peut produire'));
    if (denoms && denoms.length) {
      const p = element('p', 'ici-denoms');
      p.textContent = denoms.map((d) => (d.pc ? d.mere.fiche.nom + ' premier cru' : d.nom)).join(' · ');
      zone.appendChild(p);
    }
    const groupe = element('div', 'groupe');
    for (const a of appellations) {
      const marque = a.com ? 'communes' : (a.ha >= 100 ? Math.round(a.ha).toLocaleString('fr-FR') + ' ha délimités' : a.ha + ' ha délimités');
      groupe.appendChild(Rendu.ligne('a', a.fiche, { apercu: false, marque, sous: Rendu.NIVEAUX[a.fiche.niv] || '' }));
    }
    zone.appendChild(groupe);
  }

  function marquerRegion(id) {
    for (const b of document.querySelectorAll('#carte-regions .filtre')) b.classList.toggle('actif', b.getAttribute('data-region') === id);
  }

  function montrerRegion(id, anime) {
    if (!pret) { enAttente = { t: 'r', id }; App.aller('carte'); return; }
    if (App.vue !== 'carte') App.aller('carte');
    const r = fond.regions[id];
    if (!r) return;
    selection = { t: 'r', id };
    chargerRegion(id);
    marquerRegion(id);
    mesurer();
    cadrer(r.bm, anime !== false, 11);
    const zone = document.getElementById('carte-ici');
    zone.textContent = '';
    const fiche = Guide.get('r', id);
    if (fiche) {
      zone.appendChild(Rendu.ligne('r', fiche, { sous: Outils.pluriel(Guide.appsDeRegion(id).length, 'appellation', 'appellations') }));
      zone.appendChild(element('p', 'discret petit', 'Touchez la carte pour savoir quelles appellations se trouvent à cet endroit.'));
    }
  }

  function montrerAppellation(id) {
    if (!pret) { enAttente = { t: 'a', id }; App.aller('carte'); return; }
    if (App.vue !== 'carte') App.aller('carte');
    const resume = fond.appellations[id];
    if (!resume) { Outils.annoncer('Cette appellation n’a pas de tracé sur la carte.'); return; }
    selection = { t: 'a', id };
    marquerRegion(resume.r);
    mesurer();
    const bm = boite(resume.b);
    const marge = Math.max(bm[2] - bm[0], bm[3] - bm[1]) * 0.35;
    cadrer([bm[0] - marge, bm[1] - marge, bm[2] + marge, bm[3] + marge], true, 13.6);
    chargerRegion(resume.r).then(() => {
      const a = appellationChargee(id);
      if (a) ici([a].concat([]), []);
      demander();
    });
  }

  /* ————— branchements ————— */

  function mesurer() {
    const cadre = document.getElementById('carte-cadre');
    const l = cadre.clientWidth;
    const h = cadre.clientHeight;
    if (!l || !h) return false;
    dpr = Math.min(2.5, racine.devicePixelRatio || 1);
    if (l !== largeur || h !== hauteur || toile.width !== Math.round(l * dpr)) {
      largeur = l;
      hauteur = h;
      toile.width = Math.round(l * dpr);
      toile.height = Math.round(h * dpr);
    }
    return true;
  }

  function brancherGestes() {
    const doigts = new Map();
    let depart = null;
    let pince = null;
    let dernierTap = 0;

    toile.addEventListener('pointerdown', (e) => {
      toile.setPointerCapture(e.pointerId);
      doigts.set(e.pointerId, [e.offsetX, e.offsetY]);
      if (animation) { cancelAnimationFrame(animation); animation = null; }
      if (doigts.size === 1) depart = { x: e.offsetX, y: e.offsetY, t: performance.now(), bouge: false };
      if (doigts.size === 2) {
        const [a, b] = Array.from(doigts.values());
        pince = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) };
        if (depart) depart.bouge = true;
      }
    });
    toile.addEventListener('pointermove', (e) => {
      if (!doigts.has(e.pointerId)) return;
      const avant = doigts.get(e.pointerId);
      const apres = [e.offsetX, e.offsetY];
      if (doigts.size === 1) {
        cx -= (apres[0] - avant[0]) / ech;
        cy -= (apres[1] - avant[1]) / ech;
        if (depart && Math.hypot(apres[0] - depart.x, apres[1] - depart.y) > 7) depart.bouge = true;
        borner();
        demander();
      }
      doigts.set(e.pointerId, apres);
      if (doigts.size === 2 && pince) {
        const [a, b] = Array.from(doigts.values());
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (pince.d > 0 && d > 0) zoomer(d / pince.d, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
        pince.d = d;
      }
    });
    const lacher = (e) => {
      if (!doigts.has(e.pointerId)) return;
      doigts.delete(e.pointerId);
      if (doigts.size < 2) pince = null;
      if (doigts.size === 0 && depart && !depart.bouge && e.type === 'pointerup' && performance.now() - depart.t < 500) {
        const maintenant = performance.now();
        if (maintenant - dernierTap < 300) { zoomer(2, depart.x, depart.y); dernierTap = 0; }
        else { dernierTap = maintenant; toucher(depart.x, depart.y); }
      }
      if (doigts.size === 0) depart = null;
    };
    toile.addEventListener('pointerup', lacher);
    toile.addEventListener('pointercancel', lacher);
    toile.addEventListener('wheel', (e) => {
      e.preventDefault();
      zoomer(Math.pow(2, -e.deltaY / 300), e.offsetX, e.offsetY);
    }, { passive: false });
    toile.addEventListener('keydown', (e) => {
      const pas = 60 / ech;
      if (e.key === '+' || e.key === '=') zoomer(1.5);
      else if (e.key === '-') zoomer(1 / 1.5);
      else if (e.key === 'ArrowLeft') { cx -= pas; borner(); demander(); }
      else if (e.key === 'ArrowRight') { cx += pas; borner(); demander(); }
      else if (e.key === 'ArrowUp') { cy -= pas; borner(); demander(); }
      else if (e.key === 'ArrowDown') { cy += pas; borner(); demander(); }
      else return;
      e.preventDefault();
    });
  }

  async function montrer() {
    if (pret) { if (mesurer()) demander(); return; }
    if (enCours) return;
    enCours = true;
    toile = document.getElementById('carte-toile');
    toile.tabIndex = 0;
    ctx = toile.getContext('2d');
    const attente = document.getElementById('carte-attente');
    attente.hidden = false;
    try {
      await chargerFond();
    } catch (erreur) {
      attente.textContent = 'La carte n’a pas pu se charger.';
      enCours = false;
      return;
    }
    attente.hidden = true;
    lireCouleurs();
    mesurer();

    const filtres = document.getElementById('carte-regions');
    const ordre = Guide.donnees.regions.filter((r) => fond.regions[r.id]).sort((x, y) => x.nom.localeCompare(y.nom, 'fr'));
    for (const r of ordre) {
      const b = bouton('filtre region-' + r.id, null, () => montrerRegion(r.id, true));
      b.setAttribute('data-region', r.id);
      b.appendChild(element('span', 'point-region'));
      b.appendChild(element('span', null, r.nom));
      filtres.appendChild(b);
    }

    brancherGestes();
    document.getElementById('carte-plus').addEventListener('click', () => zoomer(1.8));
    document.getElementById('carte-moins').addEventListener('click', () => zoomer(1 / 1.8));
    document.getElementById('carte-france').addEventListener('click', () => france(true));
    if (racine.ResizeObserver) new ResizeObserver(() => { if (App.vue === 'carte' && mesurer()) demander(); }).observe(document.getElementById('carte-cadre'));
    racine.addEventListener('resize', () => { if (App.vue === 'carte' && mesurer()) demander(); });
    document.addEventListener('reglages-changes', () => { lireCouleurs(); demander(); });
    if (racine.matchMedia) racine.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { lireCouleurs(); demander(); });

    pret = true;
    france(false);
    if (enAttente) {
      const { t, id } = enAttente;
      enAttente = null;
      if (t === 'a') montrerAppellation(id); else montrerRegion(id, false);
    }
  }

  racine.Carte = {
    brancher() { /* la carte ne se charge qu'à sa première ouverture */ },
    montrer, montrerAppellation, montrerRegion,
    /* pour les épreuves */
    get etat() { return { pret, zoom: pret && ech ? zoom() : 0, selection, regions: Array.from(regions.keys()) }; },
  };

})(window);
