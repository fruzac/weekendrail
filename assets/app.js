(() => {
  'use strict';

  /* ---------- Constantes ---------- */

  const VILLES = ['Grenoble', 'Saint Marcellin', 'Lyon', 'Valence', 'Chambéry', 'Annecy'];
  const COURT = { 'Saint Marcellin': 'St Marcellin' };
  const JOURS = ['ven', 'sam', 'dim', 'lun'];
  const JOURS_NOMS = ['Vendredi', 'Samedi', 'Dimanche', 'Lundi'];
  const DEBUT = 12; // vendredi 12h, en heures depuis vendredi 0h
  const FIN = 84; // lundi 12h
  const ETENDUE = FIN - DEBUT;
  const GARES = {
    'PARIS (intramuros)': 'Paris',
    'LYON (intramuros)': 'Lyon',
    'LYON ST EXUPERY TGV.': 'Lyon Saint-Exupéry',
    'VALENCE TGV AUVERGNE RHONE ALPES': 'Valence TGV',
    'VALENCE VILLE': 'Valence Ville',
    'CHAMBERY CHALLES LES EAUX': 'Chambéry',
    'GRENOBLE': 'Grenoble',
    'ANNECY': 'Annecy',
  };

  /* Correspondances : TGV à 0€ jusqu'à une gare, puis TER. */
  const NOEUD_TGV = {
    'LYON (intramuros)': 'LYON',
    'VALENCE TGV AUVERGNE RHONE ALPES': 'VALENCE_TGV',
    'VALENCE VILLE': 'VALENCE_VILLE',
    'CHAMBERY CHALLES LES EAUX': 'CHAMBERY',
    'GRENOBLE': 'GRENOBLE',
  };
  const NOM_VIA = {
    LYON: 'Lyon', VALENCE_TGV: 'Valence TGV', VALENCE_VILLE: 'Valence Ville', CHAMBERY: 'Chambéry', GRENOBLE: 'Grenoble',
  };
  const FINALES = { Grenoble: 'GRENOBLE', 'Saint Marcellin': 'ST_MARCELLIN' };
  const CORRESPONDANCE_MIN = { LYON: 15 };
  const CORRESPONDANCE_DEFAUT = 8;
  const ATTENTE_MAX = 75;
  const TOTAL_MAX = 240;

  // Par défaut : aller du vendredi midi au samedi 13h, retour du samedi 17h au lundi 6h (le 5h45 de Grenoble).
  const DEFAUT = { mode: 'ar', sensSimple: 'aller', aller: 'Grenoble', retour: 'Grenoble', ad: 12, aa: 37, rd: 41, ra: 78, payants: false, correspondances: true, rendu: 'horloge' };
  const CLE_STOCKAGE = 'weekendrail:reglages:v3';
  const RENDUS = ['horloge', 'plaques', 'carte'];
  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const MOIS_COURT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const FLECHE = '<svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"><path d="M7 17 17 7M8 7h9v9"/></svg>';
  const CHEVRON = '<svg class="chev" aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M6 9l6 6 6-6"/></svg>';

  const etat = { r: chargerReglages(), donnees: null, ter: null, stats: null, vendredi: null, ouverts: new Map(), cache: new Map() };

  /* ---------- Réglages, gardés sur le téléphone ---------- */

  function chargerReglages() {
    let lu = {};
    try {
      lu = JSON.parse(localStorage.getItem(CLE_STOCKAGE) || '{}') || {};
    } catch (e) {
      lu = {};
    }
    const r = { ...DEFAUT };
    if (['ar', 'simple'].includes(lu.mode)) r.mode = lu.mode;
    if (['aller', 'retour'].includes(lu.sensSimple)) r.sensSimple = lu.sensSimple;
    if (VILLES.includes(lu.aller)) r.aller = lu.aller;
    if (VILLES.includes(lu.retour)) r.retour = lu.retour;
    const borne = (v) => Number.isInteger(v) && v >= DEBUT && v <= FIN;
    if (borne(lu.ad) && borne(lu.aa) && lu.ad < lu.aa) { r.ad = lu.ad; r.aa = lu.aa; }
    if (borne(lu.rd) && borne(lu.ra) && lu.rd < lu.ra) { r.rd = lu.rd; r.ra = lu.ra; }
    if (typeof lu.payants === 'boolean') r.payants = lu.payants;
    if (typeof lu.correspondances === 'boolean') r.correspondances = lu.correspondances;
    if (RENDUS.includes(lu.rendu)) r.rendu = lu.rendu;
    return r;
  }

  function sauver() {
    try {
      localStorage.setItem(CLE_STOCKAGE, JSON.stringify(etat.r));
    } catch (e) {
      /* stockage indisponible : les réglages durent le temps de la visite */
    }
  }

  /* ---------- Dates et heures ---------- */

  const fmtJourParis = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' });
  const fmtHeureParis = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const fmtInstant = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

  const aujourdhui = () => fmtJourParis.format(new Date());
  const minutesMaintenant = () => {
    const [h, m] = fmtHeureParis.format(new Date()).split(':').map(Number);
    return h * 60 + m;
  };
  const versDate = (iso) => new Date(iso + 'T00:00:00Z');
  const ajouterJours = (iso, n) => {
    const d = versDate(iso);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const jourDuMois = (iso) => versDate(iso).getUTCDate();
  const moisDe = (iso) => versDate(iso).getUTCMonth();

  function vendrediDe(iso) {
    const j = versDate(iso).getUTCDay();
    const recul = { 5: 0, 6: 1, 0: 2, 1: 3 };
    if (j in recul) return ajouterJours(iso, -recul[j]);
    return ajouterJours(iso, (5 - j + 7) % 7);
  }

  const minutes = (hhmm) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  };
  const enHeure = (min) => {
    const m = ((Math.round(min) % 1440) + 1440) % 1440;
    return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
  };
  const heure = (hhmm) => enHeure(minutes(hhmm));
  function dureeMinutes(t) {
    let d = minutes(t.arrivee) - minutes(t.depart);
    if (d < 0) d += 1440;
    return d;
  }
  const absolu = (iso, hhmm) => Math.round(versDate(iso).getTime() / 60000) + minutes(hhmm);

  function instant(texte) {
    if (!texte) return '';
    const d = new Date(texte);
    if (Number.isNaN(d.getTime())) return '';
    const p = Object.fromEntries(fmtInstant.formatToParts(d).map((x) => [x.type, x.value]));
    return `${Number(p.day)} ${MOIS_COURT[Number(p.month) - 1]}, ${Number(p.hour)}h${p.minute}`;
  }

  function estParti(date, depart) {
    const auj = aujourdhui();
    return date < auj || (date === auj && minutes(depart) < minutesMaintenant());
  }

  /* Heure du curseur (heures depuis vendredi 0h) → « sam 14h » */
  function libelleHeure(h) {
    const d = Math.floor(h / 24);
    const hh = h - d * 24;
    return hh === 0 ? `${JOURS[d - 1]} minuit` : `${JOURS[d]} ${hh}h`;
  }

  /* ---------- Données ---------- */

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const cleTrain = (t) => [t.date, t.train, t.origine, t.destination].join('|');
  const court = (v) => COURT[v] || v;

  const ABREGES = { 'Lyon Saint-Exupéry': 'Lyon Saint-Ex' };
  const gareCourte = (brut) => { const n = nomGare(brut); return ABREGES[n] || COURT[n] || n; };

  function nomGare(brut) {
    if (GARES[brut]) return GARES[brut];
    return String(brut).toLowerCase().replace(/(^|[\s(])\S/g, (c) => c.toUpperCase());
  }

  /* Les weekends à montrer : au moins les six prochains, même si la SNCF ne les a pas encore publiés. */
  function weekends() {
    const liste = [];
    const fin = etat.fin || aujourdhui();
    for (let v = vendrediDe(aujourdhui()); liste.length < 6 || v <= fin; v = ajouterJours(v, 7)) liste.push(v);
    return liste;
  }
  const publie = (v) => !!etat.fin && v <= etat.fin;

  function lienSncf(origine, destination, iso, hhmm) {
    const d = versDate(iso);
    const texte = `${origine} ${destination} le ${d.getUTCDate()} ${MOIS[d.getUTCMonth()]} à ${heure(hhmm)}`;
    return `https://www.sncf-connect.com/app/home/search?userInput=${encodeURIComponent(texte)}`;
  }

  function pourcentage(t) {
    const s = etat.stats && etat.stats.trains;
    if (!s) return null;
    const jour = (versDate(t.date).getUTCDay() + 6) % 7; // lundi = 0, comme Python
    const x = s[`${t.train}|${t.origine}|${t.destination}|${jour}`];
    return x ? x.pct : null;
  }

  /* Un trajet : un TGV direct, ou un TGV à 0€ puis un TER. Positions en heures depuis le vendredi 0h. */
  function trajetDirect(t, vendredi) {
    const aller = t.sens === 'aller';
    const debut = absolu(t.date, t.depart);
    const base = absolu(vendredi, '00:00');
    const autre = aller ? nomGare(t.destination) : nomGare(t.origine);
    const reste = autre.startsWith(`${t.ville} `) ? autre.slice(t.ville.length + 1) : autre;
    return {
      type: 'direct', cle: cleTrain(t), date: t.date, depart: t.depart, ville: t.ville, sens: t.sens, zero: t.zero, tgv: t,
      h: (debut - base) / 60, fin: debut + dureeMinutes(t),
      precision: 'direct', gareDe: gareCourte(t.origine), gareA: gareCourte(t.destination), arrivee: heure(t.arrivee), duree: dureeMinutes(t),
      lien: lienSncf(aller ? 'Paris' : nomGare(t.origine), aller ? nomGare(t.destination) : 'Paris', t.date, t.depart),
    };
  }

  function correspondances(date, sens, ville, vendredi) {
    const finale = FINALES[ville];
    if (!finale) return [];
    const liaisons = (etat.ter && etat.ter.liaisons) || {};
    const base = absolu(vendredi, '00:00');
    const resultats = new Map();
    for (const t of etat.donnees.trains) {
      if (t.date !== date || t.sens !== sens || !t.zero) continue;
      const noeud = NOEUD_TGV[sens === 'aller' ? t.destination : t.origine];
      if (!noeud || noeud === finale) continue;
      const marge = CORRESPONDANCE_MIN[noeud] || CORRESPONDANCE_DEFAUT;
      const tgvDebut = absolu(t.date, t.depart);
      const tgvFin = tgvDebut + dureeMinutes(t);
      let c = null;
      if (sens === 'aller') {
        const ters = (liaisons[`${noeud}>${finale}`] || {})[date] || [];
        const ter = ters.find(([d]) => {
          const dep = absolu(date, d);
          return dep >= tgvFin + marge && dep <= tgvFin + ATTENTE_MAX;
        });
        if (!ter) continue;
        const fin = absolu(date, ter[1]);
        if (fin - tgvDebut > TOTAL_MAX) continue;
        c = {
          debut: tgvDebut, fin, depart: t.depart, arrivee: heure(ter[1]),
          etapes: [{ mode: 'TGV', min: dureeMinutes(t), zero: true }, { mode: 'TER', min: absolu(date, ter[1]) - absolu(date, ter[0]) }],
          lien: lienSncf('Paris', ville, date, t.depart),
        };
      } else {
        const ters = (liaisons[`${finale}>${noeud}`] || {})[date] || [];
        let ter = null;
        for (const x of ters) {
          const arr = absolu(date, x[1]);
          if (arr <= tgvDebut - marge && arr >= tgvDebut - ATTENTE_MAX) ter = x;
        }
        if (!ter) continue;
        const debut = absolu(date, ter[0]);
        if (tgvFin - debut > TOTAL_MAX) continue;
        c = {
          debut, fin: tgvFin, depart: ter[0], arrivee: heure(t.arrivee),
          etapes: [{ mode: 'TER', min: absolu(date, ter[1]) - absolu(date, ter[0]) }, { mode: 'TGV', min: dureeMinutes(t), zero: true }],
          lien: lienSncf(ville, 'Paris', date, ter[0]),
        };
      }
      const cle = `${noeud}|${c.depart}`;
      const avant = resultats.get(cle);
      if (!avant || c.fin - c.debut < avant.fin - avant.debut) {
        resultats.set(cle, {
          type: 'via', cle: `${cleTrain(t)}|${c.depart}`, date, depart: c.depart, ville, sens, zero: true, tgv: t,
          h: (c.debut - base) / 60, fin: c.fin, debut: c.debut, lien: c.lien,
          precision: `via ${NOM_VIA[noeud]}`, gareDe: sens === 'aller' ? 'Paris' : court(ville), gareA: sens === 'aller' ? court(ville) : 'Paris', arrivee: c.arrivee, duree: c.fin - c.debut, etapes: c.etapes,
        });
      }
    }
    return [...resultats.values()];
  }

  /* Tous les trajets d'une ville dans un sens, du vendredi midi au lundi midi. */
  function trajets(sens, ville) {
    const cle = `${etat.vendredi}|${sens}|${ville}|${etat.r.correspondances}`;
    if (etat.cache.has(cle)) return etat.cache.get(cle);
    const liste = [];
    for (let i = 0; i < 4; i++) {
      const date = ajouterJours(etat.vendredi, i);
      for (const t of etat.donnees.trains) {
        if (t.date === date && t.sens === sens && t.ville === ville) liste.push(trajetDirect(t, etat.vendredi));
      }
      if (etat.r.correspondances) liste.push(...correspondances(date, sens, ville, etat.vendredi));
    }
    liste.sort((a, b) => a.h - b.h || (a.type === 'direct' ? -1 : 1));
    const dedans = liste.filter((x) => x.h >= DEBUT && x.h < FIN);
    etat.cache.set(cle, dedans);
    return dedans;
  }

  const dans = (x, de, a) => x.h >= de && x.h < a;
  const dispo = (x) => x.zero && !estParti(x.date, x.depart);

  /* Ce qu'on regarde : un ou deux côtés, chacun avec sa ville, son sens et sa plage. */
  function cotes() {
    const r = etat.r;
    if (r.mode === 'simple') {
      return [{ cle: 'a', sens: r.sensSimple, ville: r.aller, de: r.ad, a: r.aa }];
    }
    return [
      { cle: 'a', sens: 'aller', ville: r.aller, de: r.ad, a: r.aa },
      { cle: 'r', sens: 'retour', ville: r.retour, de: r.rd, a: r.ra },
    ];
  }

  function evaluer() {
    const [ca, cr] = cotes();
    const zA = trajets(ca.sens, ca.ville).filter((x) => dispo(x) && dans(x, ca.de, ca.a));
    if (!cr) return { zA, zR: [], meilleur: null };
    const zR = trajets(cr.sens, cr.ville).filter((x) => dispo(x) && dans(x, cr.de, cr.a));
    const base = absolu(etat.vendredi, '00:00');
    let meilleur = null;
    for (const a of zA) {
      for (const r of zR) {
        const sur = Math.floor((base + r.h * 60 - a.fin) / 60);
        if (sur > 0 && (!meilleur || sur > meilleur.sur)) meilleur = { a, r, sur };
      }
    }
    return { zA, zR, meilleur };
  }

  /* ---------- Retour haptique (iPhone, iOS 18 et plus) ---------- */

  // Safari ne donne pas accès au vibreur. Cliquer un interrupteur natif (input switch) déclenche
  // le retour haptique du système : on en crée un invisible et on le clique.
  function vibrer() {
    try {
      if (navigator.vibrate) {
        navigator.vibrate(6);
        return;
      }
      const label = document.createElement('label');
      label.setAttribute('aria-hidden', 'true');
      label.style.display = 'none';
      const interrupteur = document.createElement('input');
      interrupteur.type = 'checkbox';
      interrupteur.setAttribute('switch', '');
      label.appendChild(interrupteur);
      document.head.appendChild(label);
      label.click();
      document.head.removeChild(label);
    } catch (e) {
      /* pas de retour haptique sur cet appareil */
    }
  }

  /* ---------- Construction de la page (une seule fois) ---------- */

  function grilleVilles(nom, aria) {
    const boutons = VILLES.map((v) => `<button type="button" role="radio" data-action="ville" data-cote="${nom}" data-ville="${esc(v)}"><span class="v-nom">${esc(court(v))}</span><span class="v-zero">0€</span></button>`).join('');
    return `<div class="grille-villes" role="radiogroup" aria-label="${aria}" data-cote="${nom}"><span class="pastille" aria-hidden="true"></span>${boutons}</div>`;
  }

  function curseur(cle, aria) {
    return `<input class="curseur c-${cle}" type="range" min="${DEBUT}" max="${FIN}" step="1" data-cle="${cle}" aria-label="${aria}">`;
  }

  /* Logo : un billet à 0€. */
  const LOGO = `<svg class="logo" viewBox="0 0 54 40" aria-hidden="true" data-action="logo"><path d="M4 6 H50 V15 A5 5 0 0 0 50 25 V34 H4 V25 A5 5 0 0 0 4 15 Z" fill="#F4F1E9"/><path d="M36 9 V31" stroke="#B79B5E" stroke-width="2" stroke-dasharray="2 3"/><text x="20" y="25" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-weight="700" font-size="14" fill="#C8662F">0€</text><circle cx="44" cy="20" r="3" fill="#24403B"/></svg>`;

  const ICONE_RENDU = '<svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 0 1 13.7-5.6M20 12a8 8 0 0 1-13.7 5.6"/><path d="M18 3v4h-4M6 21v-4h4"/></svg>';

  /* Horloge à potence : accrochée à un bras de fer forgé, cadran de quai à chiffres romains.
     Les aiguilles tournent vite et sans à‑coups, pour le plaisir de l'œil. */
  const HORLOGE = (() => {
    const cx = 96;
    const cy = 82;
    let traits = '';
    for (let i = 0; i < 60; i++) {
      const a = (i * 6 * Math.PI) / 180;
      const r1 = i % 5 === 0 ? 35.5 : 38;
      const p = (r) => `${(cx + r * Math.sin(a)).toFixed(1)} ${(cy - r * Math.cos(a)).toFixed(1)}`;
      traits += `<path d="M${p(r1)} L${p(40.5)}" stroke-width="${i % 5 === 0 ? 1.5 : 0.55}"/>`;
    }
    return `<svg viewBox="0 0 150 134" aria-hidden="true">
<rect x="2" y="4" width="8" height="58" rx="2" fill="#24403B"/><circle cx="6" cy="12" r="1.5" fill="#B79B5E"/><circle cx="6" cy="54" r="1.5" fill="#B79B5E"/>
<path d="M10 14 H100" stroke="#24403B" stroke-width="3" stroke-linecap="round"/>
<path d="M10 48 Q38 46 60 15" stroke="#24403B" stroke-width="2" fill="none"/>
<path d="M22 15 q-3 11 8 13 q9 0 7 -8 q-2 -5 -7 -2" stroke="#24403B" stroke-width="1.5" fill="none"/>
<path d="M60 15 q4 9 13 8 q6 -1 4 -6" stroke="#24403B" stroke-width="1.4" fill="none"/>
<circle cx="102" cy="14" r="3" fill="#24403B"/>
<g class="balance" id="balance">
<path d="M96 14 V32" stroke="#24403B" stroke-width="2.5"/><rect x="89" y="30" width="14" height="6" rx="2" fill="#B79B5E" stroke="#24403B" stroke-width="1"/>
<circle cx="${cx}" cy="${cy}" r="46" fill="#FBF6EA" stroke="#24403B" stroke-width="3"/>
<circle cx="${cx}" cy="${cy}" r="42.5" fill="none" stroke="#B79B5E" stroke-width=".8"/>
<g stroke="#24403B">${traits}</g>
<g font-family="Fraunces, Georgia, serif" font-size="9.5" font-weight="600" fill="#24403B" text-anchor="middle"><text x="96" y="55.5">XII</text><text x="123" y="85.4">III</text><text x="96" y="115.5">VI</text><text x="69" y="85.4">IX</text></g>
<g class="tour" id="tour-h"><g class="aig aig-h"><path d="M96 86 L96 63" stroke="#24403B" stroke-width="3" stroke-linecap="round"/><path d="M96 58.5 L98.8 63 L96 67 L93.2 63Z" fill="#24403B"/></g></g>
<g class="tour" id="tour-m"><g class="aig aig-m"><path d="M96 88 L96 47" stroke="#24403B" stroke-width="1.7" stroke-linecap="round"/></g></g>
<g class="tour" id="tour-s"><g class="aig aig-s"><path d="M96 92 L96 44" stroke="#C8662F" stroke-width="1"/><circle cx="96" cy="49.5" r="1.9" fill="none" stroke="#C8662F" stroke-width="1"/></g></g>
<circle cx="${cx}" cy="${cy}" r="3" fill="#C8662F" stroke="#24403B" stroke-width=".8"/>
</g></svg>`;
  })();

  function construire() {
    document.getElementById('app').innerHTML = `<header class="tete" id="tete">
<div class="titre">${LOGO}<div class="t-textes"><h1>Ton weekend</h1><span id="dates" class="dates"></span></div><button type="button" class="bouton-antic" data-action="ouvrir-antic" aria-label="Mes anticipations"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18M12 13.5v3l2 1"/></svg><span id="compte-antic"></span></button></div>
<div id="semaines" class="semaines" role="tablist" aria-label="Prochains weekends"></div>
<div class="mode" role="radiogroup" aria-label="Type de recherche"><span class="pastille" aria-hidden="true"></span>
<button type="button" role="radio" data-action="mode" data-mode="ar">Aller et retour</button>
<button type="button" role="radio" data-action="mode" data-mode="simple">Un seul trajet</button></div>
<div class="villes">
<div class="groupe">
<div class="ligne-titre"><span class="etiquette" id="titre-aller"></span>
<button type="button" class="inverser" data-action="inverser" aria-label="Inverser le sens du trajet"><svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M16 3l4 4-4 4M20 17H4M8 13l-4 4 4 4"/></svg>Inverser</button></div>
${grilleVilles('a', 'Ville de l’aller')}
</div>
<div class="pliable" id="pli-retour"><div class="groupe espace">
<div class="ligne-titre"><span class="etiquette" id="titre-retour"></span></div>
${grilleVilles('r', 'Ville du retour')}
</div></div>
</div>
<div class="groupe">
<div class="ligne-titre"><span class="etiquette"><span class="mot">Horaires</span></span></div>
<div class="reglages" id="reglages">
<button type="button" class="r-tete" data-action="reglages" aria-expanded="false" aria-controls="pli-reglages">
<span class="r-resume"><span id="ligne-a"></span><span id="ligne-r"></span></span>
<span class="r-modifier">Modifier</span>${CHEVRON}
</button>
<div class="pliable" id="pli-reglages"><div class="r-corps">
<div class="frise">
<div class="f-jours" aria-hidden="true"><span style="left:8.33%">ven</span><span style="left:33.33%">sam</span><span style="left:66.67%">dim</span><span style="left:91.67%">lun</span></div>
<div class="f-piste" aria-hidden="true"><div class="f-dedans">
<span class="f-sep" style="left:16.67%"></span><span class="f-sep" style="left:50%"></span><span class="f-sep" style="left:83.33%"></span>
<span class="bande b-a" id="bande-a"></span><span class="bande b-r" id="bande-r"></span>
<div id="coches"></div>
<span class="poignee p-a" id="p-ad"></span><span class="poignee p-a" id="p-aa"></span>
<span class="poignee p-r" id="p-rd"></span><span class="poignee p-r" id="p-ra"></span>
</div></div>
${curseur('ad', 'Début de la plage aller')}${curseur('aa', 'Fin de la plage aller')}${curseur('rd', 'Début de la plage retour')}${curseur('ra', 'Fin de la plage retour')}
</div>
<p class="r-aide">Glisse les poignées. Les grands traits orange sont les trains à 0€.</p>
<label class="option"><span>Afficher les trains payants</span><input type="checkbox" switch data-option="payants"></label>
<label class="option"><span>Inclure les correspondances TER</span><input type="checkbox" switch data-option="correspondances"></label>
</div></div>
</div>
</div>
</header>
<section class="resultat" aria-label="Réponse"><button type="button" class="rendu" id="rendu" data-action="rendu" aria-label="Changer l’illustration">${ICONE_RENDU}</button><div id="verdict"></div><div class="illu" id="illu"><div class="dessin" id="dessin"></div><div id="plan" class="h-blocs"></div></div></section>
<div class="corps" id="corps"></div>
<section class="page-antic" id="page-antic" aria-label="Mes anticipations" hidden>
<header class="pa-tete"><button type="button" class="pa-retour" data-action="fermer-antic" aria-label="Revenir aux trains"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="m15 18-6-6 6-6"/></svg></button><h2>Mes anticipations</h2></header>
<div class="pa-corps" id="pa-corps"></div>
</section>`;
  }

  /* ---------- Mises à jour ---------- */

  const pct = (h) => `${(((h - DEBUT) / ETENDUE) * 100).toFixed(2)}%`;

  /* N'écrit dans la page que si le contenu a changé : pas de scintillement. */
  function poser(id, html) {
    const el = document.getElementById(id);
    if (el._html !== html) {
      el.innerHTML = html;
      el._html = html;
      return true;
    }
    return false;
  }

  /* Pareil, mais le nouveau contenu apparaît en fondu, en montant de quelques pixels. */
  const DOUX = 'cubic-bezier(.2, .8, .2, 1)';
  function poserDoux(id, html) {
    const el = document.getElementById(id);
    if (!poser(id, html) || !pret || calme || !el.animate) return;
    el.animate([{ opacity: 0.15, transform: 'translateY(5px)' }, { opacity: 1, transform: 'none' }], { duration: 280, easing: DOUX });
  }

  /* La carte réponse change de hauteur sans à‑coup. */
  function animerHauteur(el, avant) {
    if (!pret || calme || !el.animate) return;
    const apres = el.offsetHeight;
    if (Math.abs(apres - avant) < 3) return;
    if (el._animH) el._animH.cancel();
    el.style.overflow = 'hidden';
    el._animH = el.animate([{ height: `${avant}px` }, { height: `${apres}px` }], { duration: 320, easing: DOUX });
    el._animH.onfinish = el._animH.oncancel = () => { el.style.overflow = ''; el._animH = null; };
  }

  /* Les jours visibles arrivent en cascade ; ceux plus bas apparaissent au défilement. */
  let observateur = null;
  function animerMorceaux(el) {
    const morceaux = [...el.querySelectorAll('.s-titre, .jour')];
    const bas = window.innerHeight;
    let i = 0;
    for (const m of morceaux) {
      const haut = m.getBoundingClientRect().top;
      if (haut > bas) {
        if (observateur && pret) {
          m.classList.add('revele');
          observateur.observe(m);
        }
      } else if (pret && !calme && m.animate && i < 10) {
        m.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 320, delay: i * 35, easing: DOUX, fill: 'backwards' });
        i++;
      }
    }
  }

  /* Le nombre d'heures du titre défile jusqu'à sa nouvelle valeur. */
  function compter(el, de, a) {
    if (!el || de === a || !pret || calme) return;
    // largeur bloquée sur le plus long des deux nombres (chiffres à chasse fixe) : la suite du titre reste immobile
    const chiffres = Math.max(String(de).length, String(a).length);
    el.textContent = '0'.repeat(chiffres);
    el.style.width = `${el.getBoundingClientRect().width}px`;
    el.textContent = de;
    const t0 = performance.now();
    const pas = (t) => {
      const k = Math.min(1, (t - t0) / 520);
      el.textContent = Math.round(de + (a - de) * (1 - (1 - k) ** 3));
      if (k < 1) requestAnimationFrame(pas);
      else el.style.width = '';
    };
    requestAnimationFrame(pas);
  }

  function majReglages() {
    const r = etat.r;
    const tete = document.getElementById('tete');
    tete.classList.toggle('simple', r.mode === 'simple');
    const mode = tete.querySelector('.mode');
    mode.style.setProperty('--i', r.mode === 'ar' ? 0 : 1);
    for (const b of mode.querySelectorAll('button')) {
      const on = b.dataset.mode === r.mode;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
    }
    for (const [nom, ville] of [['a', r.aller], ['r', r.retour]]) {
      const g = tete.querySelector(`.grille-villes[data-cote="${nom}"]`);
      const i = VILLES.indexOf(ville);
      g.style.setProperty('--x', i % 3);
      g.style.setProperty('--y', Math.floor(i / 3));
      for (const b of g.querySelectorAll('button')) {
        const on = b.dataset.ville === ville;
        b.classList.toggle('on', on);
        b.setAttribute('aria-checked', String(on));
      }
    }
    const trajet = r.mode === 'ar' || r.sensSimple === 'aller' ? `Paris → ${court(r.aller)}` : `${court(r.aller)} → Paris`;
    document.getElementById('titre-aller').innerHTML = `<span class="mot">${r.mode === 'ar' ? 'Aller' : 'Trajet'}</span><span class="trajet">${esc(trajet)}</span>`;
    document.getElementById('titre-retour').innerHTML = `<span class="mot">Retour</span><span class="trajet">${esc(court(r.retour))} → Paris</span>`;
    plier(document.getElementById('pli-retour'), r.mode === 'ar');
    for (const input of tete.querySelectorAll('[data-option]')) input.checked = !!r[input.dataset.option];
    majPlages();
  }

  function majPlages() {
    const r = etat.r;
    for (const cle of ['ad', 'aa', 'rd', 'ra']) {
      const input = document.querySelector(`.c-${cle}`);
      if (Number(input.value) !== r[cle]) input.value = r[cle];
      input.setAttribute('aria-valuetext', libelleHeure(r[cle]));
      document.getElementById(`p-${cle}`).style.left = pct(r[cle]);
    }
    const ba = document.getElementById('bande-a');
    ba.style.left = pct(r.ad);
    ba.style.width = `${((r.aa - r.ad) / ETENDUE) * 100}%`;
    const br = document.getElementById('bande-r');
    br.style.left = pct(r.rd);
    br.style.width = `${((r.ra - r.rd) / ETENDUE) * 100}%`;
    const ar = r.mode === 'ar';
    document.getElementById('ligne-a').innerHTML = `<b>${ar ? 'Aller' : 'Trajet'}</b> ${libelleHeure(r.ad)} → ${libelleHeure(r.aa)}`;
    document.getElementById('ligne-r').innerHTML = ar ? `<b>Retour</b> ${libelleHeure(r.rd)} → ${libelleHeure(r.ra)}` : '';
  }

  /* Tout ce qui dépend des données. Pendant qu'on glisse un curseur, seule la frise bouge. */
  function majResultats() {
    const ev = evaluer();
    const carte = document.querySelector('.resultat');
    const avant = carte.offsetHeight;
    majDates();
    majSemaines();
    majVilles();
    majCoches();
    majPlan(ev);
    majVerdict(ev);
    animerHauteur(carte, avant);
    majCorps();
  }

  function majDates() {
    const sam = ajouterJours(etat.vendredi, 1);
    const dim = ajouterJours(etat.vendredi, 2);
    const texte = moisDe(sam) === moisDe(dim)
      ? `weekend du ${jourDuMois(sam)}-${jourDuMois(dim)} ${MOIS_COURT[moisDe(dim)]}`
      : `weekend du ${jourDuMois(sam)} ${MOIS_COURT[moisDe(sam)]} au ${jourDuMois(dim)} ${MOIS_COURT[moisDe(dim)]}`;
    document.getElementById('dates').textContent = texte;
  }

  function majSemaines() {
    const garde = etat.vendredi;
    const liste = weekends().slice(0, 6);
    const html = liste.map((v) => {
      etat.vendredi = v;
      const ev = evaluer();
      let statut = etat.r.mode === 'ar'
        ? (ev.meilleur ? 'oui' : (ev.zA.length || ev.zR.length ? 'partiel' : 'rien'))
        : (ev.zA.length ? 'oui' : 'rien');
      if (!publie(v)) statut = 'futur';
      const sam = ajouterJours(v, 1);
      const dim = ajouterJours(v, 2);
      const jours = `${jourDuMois(sam)}-${jourDuMois(dim)}`;
      const mois = moisDe(sam) === moisDe(dim) ? MOIS_COURT[moisDe(sam)] : `${MOIS_COURT[moisDe(sam)]} ${MOIS_COURT[moisDe(dim)]}`;
      const on = v === garde;
      const dit = { oui: 'weekend possible', partiel: 'un seul sens à 0€', rien: 'rien à 0€', futur: 'pas encore publié' }[statut];
      return `<button type="button" role="tab" class="semaine ${statut}${on ? ' on' : ''}" aria-selected="${on}" aria-label="Weekend du ${jours} ${mois}, ${dit}" data-action="semaine" data-vendredi="${v}"><span class="s-mois">${mois}</span><span class="s-jours">${jours}</span><span class="s-point" aria-hidden="true"></span></button>`;
    }).join('');
    etat.vendredi = garde;
    poser('semaines', html);
  }

  /* Sous chaque ville, « 0€ » en bordeaux s'il y a un train à 0€ dans la plage. */
  function majVilles() {
    for (const c of cotes()) {
      const g = document.querySelector(`.grille-villes[data-cote="${c.cle}"]`);
      for (const b of g.querySelectorAll('button')) {
        const z = trajets(c.sens, b.dataset.ville).some((x) => dispo(x) && dans(x, c.de, c.a));
        b.classList.toggle('a-zero', z);
      }
    }
  }

  function majCoches() {
    const html = cotes().map((c) => trajets(c.sens, c.ville).map((x) => {
      const ok = dans(x, c.de, c.a);
      const classes = ['coche', c.cle === 'r' ? 'cr' : 'ca', x.zero ? 'zero' : '', ok ? '' : 'hors'].filter(Boolean).join(' ');
      return `<span class="${classes}" style="left:${pct(x.h)}" data-c="${c.cle}" data-h="${x.h}"></span>`;
    }).join('')).join('');
    poser('coches', html);
  }

  /* Pendant le glissement, on n'éteint ou n'allume que les traits déjà posés. */
  function allumerCoches() {
    const r = etat.r;
    for (const el of document.getElementById('coches').children) {
      const h = Number(el.dataset.h);
      const [de, a] = el.dataset.c === 'r' ? [r.rd, r.ra] : [r.ad, r.aa];
      el.classList.toggle('hors', !(h >= de && h < a));
    }
  }

  const quand = (x) => `${JOURS[Math.floor(x.h / 24)]} ${heure(x.depart)}`;

  const JOURS_SEMAINE = ['DIM', 'LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM'];
  /* « SAM 7 NOV », comme sur un billet. */
  const jourBillet = (iso) => `${JOURS_SEMAINE[versDate(iso).getUTCDay()]} ${jourDuMois(iso)} ${MOIS_COURT[moisDe(iso)].replace('.', '').toUpperCase()}`;

  /* Un départ écrit à côté de l'horloge : le jour, l'heure en grand, le trajet et l'arrivée. */
  function blocDepart(mot, x, de, a) {
    if (x) {
      return `<div class="h-bloc"><span class="h-mot">${mot} · ${jourBillet(x.date)}</span><span class="h-heure">${heure(x.depart)}</span><span class="h-trajet">${esc(x.gareDe)} → ${esc(x.gareA)}${x.type === 'via' ? ` ${esc(x.precision)}` : ''}, arr. ${x.arrivee}</span></div>`;
    }
    const pourquoi = publie(etat.vendredi) ? 'rien à 0€ dans ta plage' : 'pas encore publié';
    return `<div class="h-bloc h-vide"><span class="h-mot">${mot}</span><span class="h-heure">pas encore</span><span class="h-trajet">${esc(de)} → ${esc(a)}, ${pourquoi}</span></div>`;
  }

  function majPlan(ev) {
    const r = etat.r;
    // Les départs écrits sont ceux du meilleur séjour, sinon les premiers à 0€.
    const a0 = ev.meilleur ? ev.meilleur.a : ev.zA[0];
    const r0 = ev.meilleur ? ev.meilleur.r : ev.zR[0];
    const plan = document.getElementById('plan');
    const forme = r.mode === 'ar' ? 'ar' : 'simple';
    if (plan.dataset.forme !== forme) {
      plan.innerHTML = forme === 'ar' ? '<div id="plan-a"></div><span class="h-filet" aria-hidden="true"></span><div id="plan-r"></div>' : '<div id="plan-a"></div>';
      plan.dataset.forme = forme;
    }
    if (forme === 'ar') {
      poserDoux('plan-a', blocDepart('ALLER', a0, 'Paris', court(r.aller)));
      poserDoux('plan-r', blocDepart('RETOUR', r0, court(r.retour), 'Paris'));
    } else {
      const aller = r.sensSimple === 'aller';
      poserDoux('plan-a', blocDepart('TRAJET', a0, aller ? 'Paris' : court(r.aller), aller ? court(r.aller) : 'Paris'));
    }
    majDessin(a0, r0);
  }

  /* ---------- Les trois illustrations de la carte réponse ---------- */

  const HORLOGE_BOUTON = () => `<button type="button" class="horloge" id="horloge" data-action="horloge" aria-label="Horloge de gare">${HORLOGE}</button>`;

  function majDessin(a0, r0) {
    const rendu = etat.r.rendu;
    document.getElementById('illu').className = `illu r-${rendu}`;
    const html = rendu === 'plaques' ? dessinPlaques(a0, r0) : rendu === 'carte' ? dessinCarte(a0, r0) : HORLOGE_BOUTON();
    poserDoux('dessin', html);
  }

  const MAJ = (v) => court(v).toUpperCase();

  /* Plaque émaillée : fond vert, filet lin, nom en capitales. Touchée, elle se balance sur ses crochets. */
  function plaque(x, y, w, nom) {
    const long = nom.length > 9;
    return `<g class="plaque" data-action="plaque" style="transform-origin:${x + w / 2}px ${y - 5}px"><path d="M${x + 14} ${y - 5} V${y} M${x + w - 14} ${y - 5} V${y}" stroke="#24403B" stroke-width="1.4"/>
<rect x="${x}" y="${y}" width="${w}" height="28" rx="5" fill="#24403B"/><rect x="${x + 3}" y="${y + 3}" width="${w - 6}" height="22" rx="3" fill="none" stroke="#F4F1E9" stroke-width=".8"/>
<text x="${x + w / 2}" y="${y + 18.5}" text-anchor="middle" class="d-plaque" style="font-size:${long ? 10.5 : 12.5}px;letter-spacing:${long ? 0.8 : 2}px">${esc(nom)}</text></g>`;
  }

  function voieFerree(y, actif) {
    return `<g opacity="${actif ? 1 : 0.35}"><path d="M6 ${y} H316" stroke="#B79B5E" stroke-width="10" stroke-dasharray="1.6 6" opacity=".75"/><path d="M6 ${y - 3} H316 M6 ${y + 3} H316" stroke="#24403B" stroke-width="1.2"/></g>`;
  }

  function petitTrain(x0, y, gauche) {
    let out = '';
    for (let k = 0; k < 3; k++) {
      const x = x0 + k * 22;
      const loco = gauche ? k === 0 : k === 2;
      out += `<rect x="${x}" y="${y - 17}" width="20" height="11" rx="2.5" fill="${loco ? '#C8662F' : '#FFFDF7'}" stroke="#24403B" stroke-width="1.1"/><rect x="${x + 4}" y="${y - 14.5}" width="4" height="3.5" fill="#24403B" opacity=".75"/><rect x="${x + 12}" y="${y - 14.5}" width="4" height="3.5" fill="#24403B" opacity=".75"/><circle cx="${x + 5}" cy="${y - 4.5}" r="1.8" fill="#24403B"/><circle cx="${x + 15}" cy="${y - 4.5}" r="1.8" fill="#24403B"/>`;
    }
    return out;
  }

  function dessinPlaques(a0, r0) {
    const r = etat.r;
    const t = (x, y, ancre, texte) => `<text x="${x}" y="${y}" text-anchor="${ancre}" class="d-mono">${texte}</text>`;
    const absent = (y) => `<text x="161" y="${y}" text-anchor="middle" class="d-ital" font-size="11.5">pas encore de train à 0€</text>`;
    if (r.mode !== 'ar') {
      const aller = r.sensSimple === 'aller';
      const x = a0;
      return `<svg viewBox="0 0 322 92" role="img" aria-label="Plaques de gare">${plaque(4, 8, 100, aller ? 'PARIS' : MAJ(r.aller))}${plaque(206, 8, 112, aller ? MAJ(r.aller) : 'PARIS')}
${x ? t(155, 23, 'middle', jourBillet(x.date)) + t(54, 50, 'middle', `dép. ${heure(x.depart)}`) + t(262, 50, 'middle', `arr. ${x.arrivee}`) : ''}
${voieFerree(72, !!x)}${x ? `<g class="${aller ? 'navA' : 'navA'}">${petitTrain(10, 72, false)}</g>` : absent(62)}</svg>`;
    }
    const deux = r.aller !== r.retour;
    return `<svg viewBox="0 0 322 ${deux ? 160 : 128}" role="img" aria-label="Plaques de gare">${plaque(4, 8, 100, 'PARIS')}${plaque(206, 8, 112, MAJ(r.aller))}
${a0 ? t(155, 23, 'middle', jourBillet(a0.date)) + t(54, 50, 'middle', `dép. ${heure(a0.depart)}`) + t(262, 50, 'middle', `arr. ${a0.arrivee}`) : ''}
${voieFerree(70, !!a0)}${a0 ? `<g class="navA">${petitTrain(10, 70, false)}</g>` : absent(60)}
${voieFerree(102, !!r0)}${r0 ? `<g class="navR">${petitTrain(248, 102, true)}</g>` : absent(92)}
${r0 ? t(54, 120, 'middle', `arr. ${r0.arrivee}`) + t(155, 120, 'middle', jourBillet(r0.date)) + t(262, 120, 'middle', `dép. ${heure(r0.depart)}`) : ''}
${deux ? plaque(206, 130, 112, MAJ(r.retour)) : ''}</svg>`;
  }

  /* ---------- Carte ancienne (bloc généré par gencarte.py) ----------
     Nord en haut, gares à leurs vraies coordonnées, lignes tracées à peu près comme les vraies.
     Un trajet en correspondance : TGV jusqu'à la gare de changement (marquée), puis TER, en trait plus fin. */
  const CARTE_FOND = "<rect x=\"1\" y=\"1\" width=\"320\" height=\"220\" rx=\"6\" fill=\"#FBF6EA\" stroke=\"#B79B5E\" stroke-width=\"1\"/><rect x=\"5\" y=\"5\" width=\"312\" height=\"212\" rx=\"3\" fill=\"none\" stroke=\"#B79B5E\" stroke-width=\".6\"/><path d=\"M5 74 H317 M5 148 H317 M108 5 V217 M214 5 V217\" stroke=\"#B79B5E\" stroke-opacity=\".4\" stroke-width=\".6\" stroke-dasharray=\"1 3\" fill=\"none\"/><image href=\"assets/carte-relief.svg\" x=\"0\" y=\"0\" width=\"322\" height=\"222\"/><text x=\"278.4\" y=\"41.5\" class=\"d-ital d-petit\" font-size=\"7.5\">lac d’Annecy</text><text x=\"228.3\" y=\"68.0\" text-anchor=\"end\" class=\"d-ital d-petit\" font-size=\"7.5\">lac du Bourget</text><path d=\"M113.4 10.0 L113.5 10.1 L113.6 10.2 L113.8 10.5 L114.0 10.8 L114.3 11.2 L114.6 11.6 L115.1 12.2 L115.5 12.8 L116.1 13.5 L116.6 14.3 L117.3 15.1 L118.0 16.1 L118.8 17.1 L119.6 18.2 L120.5 19.3 L121.4 20.6 L122.3 21.8 L123.1 23.0 L123.8 24.2 L124.4 25.4 L125.0 26.5 L125.5 27.6 L125.9 28.7 L126.2 29.8 L126.4 30.9 L126.6 31.9 L126.7 33.0 L126.7 34.0 L126.7 35.0 L126.5 35.9 L126.3 36.9 L126.0 37.8 L125.7 38.7 L125.4 39.7 L125.0 40.6 L124.7 41.5 L124.3 42.4 L124.0 43.3 L123.6 44.2 L123.2 45.0 L122.7 45.9 L122.3 46.8 L121.9 47.6 L121.4 48.5 L120.9 49.4 L120.5 50.2 L120.0 51.0 L119.4 51.9 L119.0 52.6 L118.5 53.4 L118.1 54.0 L117.7 54.7 L117.4 55.2 L117.0 55.8 L116.8 56.2 L116.5 56.6 L116.3 57.0 L116.1 57.3 L115.9 57.6 L115.8 57.8 L115.7 57.9 L115.6 58.0 L115.6 58.1 M113.4 10.0 L113.5 10.1 L113.6 10.2 L113.8 10.5 L114.0 10.8 L114.3 11.2 L114.6 11.6 L115.1 12.2 L115.5 12.8 L116.1 13.5 L116.6 14.3 L117.3 15.1 L118.0 16.1 L118.8 17.1 L119.6 18.2 L120.5 19.3 L121.4 20.6 L122.3 21.8 L123.2 23.1 L124.1 24.3 L125.0 25.6 L125.8 26.9 L126.6 28.2 L127.4 29.5 L128.2 30.7 L128.9 32.0 L129.6 33.4 L130.3 34.7 L131.0 36.0 L131.6 37.3 L132.3 38.6 L132.9 40.0 L133.4 41.3 L134.0 42.6 L134.5 43.9 L135.0 45.2 L135.5 46.4 L136.0 47.5 L136.4 48.7 L136.8 49.8 L137.2 50.9 L137.6 51.9 L137.9 53.0 L138.2 53.9 L138.5 54.9 L138.8 55.8 L139.0 56.7 L139.2 57.5 L139.4 58.4 L139.6 59.1 L139.7 59.8 L139.9 60.5 L140.0 61.1 L140.2 61.7 L140.3 62.2 L140.4 62.7 L140.5 63.1 L140.6 63.4 L140.6 63.7 L140.7 64.0 L140.7 64.2 L140.8 64.3 L140.8 64.4 L140.8 64.5 M113.4 10.0 L113.5 10.1 L113.6 10.2 L113.8 10.5 L114.0 10.8 L114.3 11.2 L114.6 11.6 L115.1 12.2 L115.5 12.8 L116.1 13.5 L116.6 14.3 L117.3 15.1 L118.0 16.1 L118.8 17.1 L119.6 18.2 L120.5 19.3 L121.4 20.6 L122.3 21.8 L123.2 23.1 L124.1 24.3 L125.0 25.6 L125.8 26.9 L126.6 28.2 L127.4 29.5 L128.2 30.7 L128.9 32.0 L129.6 33.4 L130.3 34.7 L131.0 36.0 L131.6 37.3 L132.3 38.6 L132.9 40.0 L133.4 41.3 L134.0 42.6 L134.5 43.9 L135.0 45.2 L135.5 46.4 L136.0 47.5 L136.4 48.7 L136.8 49.8 L137.2 50.9 L137.6 51.9 L137.9 53.0 L138.2 53.9 L138.5 54.9 L138.8 55.8 L139.0 56.7 L139.2 57.5 L139.4 58.4 L139.5 59.2 L139.7 60.2 L139.7 61.2 L139.8 62.2 L139.8 63.3 L139.7 64.5 L139.7 65.8 L139.6 67.0 L139.4 68.4 L139.2 69.8 L139.0 71.3 L138.7 72.8 L138.5 74.4 L138.1 76.1 L137.8 77.8 L137.3 79.5 L136.9 81.3 L136.6 83.1 L136.2 85.0 L135.8 86.8 L135.4 88.7 L135.1 90.5 L134.7 92.5 L134.4 94.4 L134.0 96.3 L133.7 98.3 L133.3 100.3 L133.0 102.3 L132.7 104.3 L132.4 106.3 L132.1 108.4 L131.8 110.4 L131.5 112.5 L131.3 114.6 L131.0 116.7 L130.8 118.7 L130.5 120.8 L130.3 122.9 L130.1 125.0 L130.0 127.0 L129.8 129.1 L129.6 131.2 L129.5 133.2 L129.4 135.3 L129.3 137.4 L129.2 139.4 L129.1 141.5 L129.0 143.6 L129.0 145.6 L128.9 147.6 L128.9 149.6 L128.8 151.6 L128.8 153.5 L128.8 155.4 L128.8 157.3 L128.7 159.2 L128.7 161.0 L128.8 162.8 L128.8 164.6 L128.8 166.4 L128.8 168.1 L128.9 169.8 L128.9 171.5 L129.0 173.1 L129.0 174.7 L129.1 176.1 L129.1 177.5 L129.2 178.7 L129.2 179.8 L129.2 180.9 L129.3 181.8 L129.3 182.6 L129.3 183.3 L129.3 184.0 L129.4 184.5 L129.4 184.9 L129.4 185.2 L129.4 185.4 L129.4 185.5 M113.4 10.0 L113.5 10.1 L113.6 10.2 L113.8 10.5 L114.0 10.8 L114.3 11.2 L114.6 11.6 L115.1 12.2 L115.5 12.8 L116.1 13.5 L116.6 14.3 L117.3 15.1 L118.0 16.1 L118.8 17.1 L119.6 18.2 L120.5 19.3 L121.4 20.6 L122.3 21.8 L123.2 23.1 L124.1 24.3 L125.0 25.6 L125.8 26.9 L126.6 28.2 L127.4 29.5 L128.2 30.7 L128.9 32.0 L129.6 33.4 L130.3 34.7 L131.0 36.0 L131.6 37.3 L132.3 38.6 L132.9 40.0 L133.4 41.3 L134.0 42.6 L134.5 43.9 L135.0 45.2 L135.5 46.4 L136.0 47.5 L136.4 48.7 L136.8 49.8 L137.2 50.9 L137.6 51.9 L137.9 53.0 L138.2 53.9 L138.5 54.9 L138.8 55.8 L139.0 56.7 L139.2 57.5 L139.4 58.4 L139.5 59.2 L139.7 60.2 L139.7 61.2 L139.8 62.2 L139.8 63.3 L139.7 64.5 L139.7 65.8 L139.6 67.0 L139.4 68.4 L139.2 69.8 L139.0 71.3 L138.7 72.8 L138.5 74.4 L138.1 76.1 L137.8 77.8 L137.3 79.5 L136.9 81.3 L136.6 83.1 L136.2 85.0 L135.8 86.8 L135.4 88.7 L135.1 90.5 L134.7 92.5 L134.4 94.4 L134.0 96.3 L133.7 98.3 L133.3 100.3 L133.0 102.3 L132.7 104.3 L132.4 106.3 L132.1 108.4 L131.8 110.4 L131.5 112.5 L131.3 114.6 L131.0 116.7 L130.8 118.7 L130.5 120.8 L130.3 122.9 L130.1 125.0 L130.0 127.0 L129.8 129.1 L129.6 131.2 L129.5 133.2 L129.4 135.3 L129.3 137.4 L129.2 139.4 L129.1 141.5 L129.0 143.6 L129.0 145.6 L128.9 147.6 L128.9 149.6 L128.8 151.6 L128.8 153.5 L128.8 155.4 L128.8 157.3 L128.7 159.2 L128.7 161.0 L128.8 162.8 L128.8 164.6 L128.8 166.4 L128.8 168.1 L128.9 169.8 L128.9 171.5 L129.0 173.1 L129.0 174.7 L129.0 176.2 L129.0 177.6 L128.9 178.9 L128.9 180.1 L128.8 181.3 L128.7 182.3 L128.5 183.3 L128.3 184.2 L128.1 185.0 L127.9 185.8 L127.7 186.4 L127.4 187.0 L127.1 187.5 L126.8 187.9 L126.4 188.2 L126.1 188.5 L125.7 188.8 L125.4 189.2 L125.1 189.5 L124.7 189.8 L124.4 190.1 L124.1 190.4 L123.8 190.7 L123.5 191.0 L123.2 191.3 L122.9 191.6 L122.6 191.9 L122.3 192.1 L122.0 192.4 L121.7 192.7 L121.5 193.0 L121.2 193.3 L121.0 193.5 L120.7 193.7 L120.5 193.9 L120.3 194.1 L120.2 194.3 L120.0 194.5 L119.9 194.6 L119.8 194.7 L119.7 194.8 L119.6 194.9 L119.5 195.0 L119.5 195.0 L119.4 195.1 L119.4 195.1 M113.4 10.0 L113.5 10.1 L113.6 10.2 L113.8 10.5 L114.0 10.8 L114.3 11.2 L114.6 11.6 L115.1 12.2 L115.5 12.8 L116.1 13.5 L116.6 14.3 L117.3 15.1 L118.0 16.1 L118.8 17.1 L119.6 18.2 L120.5 19.3 L121.4 20.6 L122.3 21.8 L123.2 23.1 L124.1 24.3 L125.0 25.6 L125.8 26.9 L126.6 28.2 L127.4 29.5 L128.2 30.7 L128.9 32.0 L129.6 33.4 L130.3 34.7 L131.0 36.0 L131.6 37.3 L132.3 38.6 L132.9 40.0 L133.4 41.3 L134.0 42.6 L134.5 43.9 L135.0 45.2 L135.5 46.4 L136.0 47.5 L136.4 48.7 L136.8 49.8 L137.2 50.9 L137.6 51.9 L137.9 53.0 L138.2 53.9 L138.5 54.9 L138.8 55.8 L139.0 56.7 L139.2 57.5 L139.4 58.4 L139.6 59.2 L139.8 60.0 L140.0 60.8 L140.2 61.6 L140.4 62.5 L140.6 63.3 L140.8 64.1 L141.0 65.0 L141.2 65.8 L141.5 66.6 L141.7 67.4 L141.9 68.3 L142.2 69.1 L142.4 69.9 L142.6 70.8 L142.9 71.6 L143.2 72.4 L143.5 73.2 L143.9 74.0 L144.4 74.8 L145.0 75.5 L145.5 76.2 L146.2 76.9 L146.9 77.6 L147.6 78.3 L148.5 78.9 L149.3 79.5 L150.3 80.1 L151.3 80.7 L152.3 81.3 L153.4 81.8 L154.6 82.3 L155.7 82.8 L156.9 83.3 L158.1 83.8 L159.3 84.2 L160.5 84.7 L161.6 85.1 L162.8 85.5 L164.0 85.9 L165.2 86.3 L166.4 86.6 L167.7 87.0 L168.9 87.3 L170.1 87.6 L171.3 87.9 L172.5 88.2 L173.8 88.4 L175.0 88.7 L176.1 88.9 L177.2 89.2 L178.3 89.4 L179.4 89.7 L180.4 89.9 L181.4 90.2 L182.3 90.4 L183.2 90.6 L184.1 90.9 L184.9 91.1 L185.7 91.3 L186.5 91.5 L187.2 91.7 L187.9 91.9 L188.6 92.2 L189.2 92.4 L189.8 92.7 L190.4 93.1 L190.9 93.5 L191.4 93.9 L191.9 94.4 L192.4 95.0 L192.8 95.5 L193.3 96.2 L193.6 96.9 L194.0 97.6 L194.3 98.4 L194.6 99.2 L194.9 100.1 L195.1 101.1 L195.4 102.0 L195.6 103.0 L195.8 104.0 L196.0 104.9 L196.2 105.9 L196.5 106.9 L196.7 107.8 L196.9 108.7 L197.1 109.7 L197.3 110.6 L197.5 111.5 L197.8 112.4 L198.0 113.3 L198.2 114.2 L198.4 115.1 L198.6 116.0 L198.9 116.9 L199.1 117.7 L199.2 118.6 L199.4 119.3 L199.5 120.1 L199.6 120.8 L199.6 121.5 L199.7 122.2 L199.7 122.8 L199.7 123.4 L199.7 123.9 L199.6 124.4 L199.5 124.9 L199.4 125.4 L199.3 125.8 L199.1 126.2 L199.0 126.6 L198.8 126.9 L198.7 127.3 L198.7 127.7 L198.6 128.1 L198.7 128.4 L198.7 128.8 L198.8 129.2 L199.0 129.6 L199.2 130.0 L199.4 130.4 L199.6 130.8 L200.0 131.2 L200.3 131.6 L200.7 132.0 L201.1 132.4 L201.6 132.8 L202.1 133.3 L202.5 133.7 L203.0 134.3 L203.6 134.8 L204.1 135.4 L204.6 136.1 L205.1 136.8 L205.7 137.5 L206.2 138.2 L206.8 139.0 L207.4 139.9 L207.9 140.7 L208.5 141.7 L209.1 142.6 L209.7 143.6 L210.4 144.6 L210.9 145.6 L211.5 146.5 L212.0 147.3 L212.4 148.1 L212.9 148.8 L213.3 149.4 L213.6 150.0 L213.9 150.5 L214.2 151.0 L214.4 151.3 L214.6 151.7 L214.8 151.9 L214.9 152.1 L215.0 152.2 L215.0 152.3 M113.4 10.0 L113.4 10.0 L113.5 10.1 L113.5 10.2 L113.6 10.3 L113.8 10.5 L113.9 10.7 L114.1 10.9 L114.3 11.2 L114.5 11.5 L114.7 11.8 L115.0 12.1 L115.3 12.5 L115.6 13.0 L115.9 13.4 L116.3 13.9 L116.7 14.4 L117.2 14.9 L117.7 15.4 L118.3 15.8 L118.9 16.2 L119.7 16.6 L120.5 16.9 L121.4 17.2 L122.3 17.5 L123.3 17.8 L124.4 18.0 L125.5 18.2 L126.8 18.3 L128.1 18.5 L129.4 18.6 L130.8 18.7 L132.3 18.7 L133.8 18.8 L135.3 18.9 L136.7 18.9 L138.2 19.0 L139.6 19.1 L141.0 19.2 L142.4 19.3 L143.7 19.5 L145.1 19.6 L146.4 19.8 L147.7 19.9 L149.0 20.1 L150.3 20.3 L151.6 20.5 L152.8 20.6 L154.1 20.9 L155.3 21.1 L156.4 21.3 L157.5 21.5 L158.6 21.7 L159.7 21.9 L160.7 22.0 L161.6 22.2 L162.6 22.4 L163.5 22.6 L164.3 22.8 L165.2 23.0 L165.9 23.2 L166.7 23.4 L167.4 23.5 L168.1 23.7 L168.7 23.9 L169.3 24.1 L170.0 24.2 L170.6 24.4 L171.2 24.6 L171.8 24.7 L172.4 24.9 L173.0 25.0 L173.6 25.2 L174.1 25.4 L174.7 25.5 L175.3 25.7 L175.8 25.8 L176.4 25.9 L176.9 26.1 L177.4 26.2 L178.0 26.4 L178.5 26.5 L179.0 26.7 L179.5 26.8 L180.1 27.0 L180.6 27.2 L181.1 27.4 L181.7 27.6 L182.2 27.9 L182.7 28.1 L183.3 28.3 L183.8 28.6 L184.4 28.9 L184.9 29.2 L185.4 29.4 L186.0 29.7 L186.5 30.1 L187.1 30.4 L187.7 30.7 L188.3 31.1 L189.0 31.5 L189.7 32.0 L190.4 32.4 L191.2 32.9 L192.0 33.4 L192.8 33.9 L193.7 34.4 L194.6 35.0 L195.5 35.5 L196.5 36.1 L197.5 36.8 L198.5 37.4 L199.5 38.1 L200.6 38.7 L201.6 39.3 L202.6 39.8 L203.7 40.4 L204.7 40.8 L205.7 41.3 L206.8 41.6 L207.8 42.0 L208.8 42.3 L209.8 42.6 L210.8 42.8 L211.8 43.0 L212.8 43.1 L213.8 43.2 L214.8 43.3 L215.7 43.3 L216.7 43.4 L217.6 43.4 L218.5 43.5 L219.4 43.6 L220.2 43.7 L221.0 43.8 L221.7 43.9 L222.5 44.1 L223.2 44.3 L223.9 44.5 L224.5 44.7 L225.1 44.9 L225.7 45.1 L226.2 45.4 L226.8 45.7 L227.2 45.9 L227.7 46.3 L228.2 46.6 L228.6 47.0 L229.1 47.5 L229.5 48.0 L230.0 48.5 L230.4 49.1 L230.8 49.7 L231.2 50.3 L231.6 51.0 L231.9 51.8 L232.3 52.5 L232.7 53.3 L233.0 54.2 L233.3 55.1 L233.7 56.0 L234.0 56.9 L234.3 57.8 L234.6 58.6 L234.8 59.4 L235.1 60.2 L235.3 60.9 L235.5 61.6 L235.7 62.3 L235.9 63.0 L236.1 63.6 L236.3 64.1 L236.4 64.7 L236.6 65.2 L236.7 65.7 L236.8 66.1 L236.9 66.6 L237.0 67.0 L237.1 67.5 L237.2 68.1 L237.3 68.7 L237.3 69.4 L237.4 70.1 L237.5 70.9 L237.6 71.7 L237.7 72.6 L237.7 73.5 L237.8 74.5 L237.9 75.5 L238.0 76.6 L238.0 77.8 L238.1 78.9 L238.2 80.2 L238.2 81.3 L238.3 82.4 L238.4 83.4 L238.4 84.3 L238.5 85.2 L238.5 85.9 L238.5 86.6 L238.6 87.2 L238.6 87.8 L238.6 88.2 L238.7 88.6 L238.7 88.9 L238.7 89.2 L238.7 89.3 L238.7 89.4 M113.4 10.0 L113.4 10.0 L113.5 10.1 L113.5 10.2 L113.6 10.3 L113.8 10.5 L113.9 10.7 L114.1 10.9 L114.3 11.2 L114.5 11.5 L114.7 11.8 L115.0 12.1 L115.3 12.5 L115.6 13.0 L115.9 13.4 L116.3 13.9 L116.7 14.4 L117.2 14.9 L117.7 15.4 L118.3 15.8 L118.9 16.2 L119.7 16.6 L120.5 16.9 L121.4 17.2 L122.3 17.5 L123.3 17.8 L124.4 18.0 L125.5 18.2 L126.8 18.3 L128.1 18.5 L129.4 18.6 L130.8 18.7 L132.3 18.7 L133.8 18.8 L135.3 18.9 L136.7 18.9 L138.2 19.0 L139.6 19.1 L141.0 19.2 L142.4 19.3 L143.7 19.5 L145.1 19.6 L146.4 19.8 L147.7 19.9 L149.0 20.1 L150.3 20.3 L151.6 20.5 L152.8 20.6 L154.1 20.9 L155.3 21.1 L156.4 21.3 L157.5 21.5 L158.6 21.7 L159.7 21.9 L160.7 22.0 L161.6 22.2 L162.6 22.4 L163.5 22.6 L164.3 22.8 L165.2 23.0 L165.9 23.2 L166.7 23.4 L167.4 23.5 L168.1 23.7 L168.7 23.9 L169.3 24.1 L170.0 24.2 L170.6 24.4 L171.2 24.6 L171.8 24.7 L172.4 24.9 L173.0 25.0 L173.6 25.2 L174.1 25.4 L174.7 25.5 L175.3 25.7 L175.8 25.8 L176.4 25.9 L176.9 26.1 L177.4 26.2 L178.0 26.4 L178.5 26.5 L179.0 26.7 L179.5 26.8 L180.1 27.0 L180.6 27.2 L181.1 27.4 L181.7 27.6 L182.2 27.9 L182.7 28.1 L183.3 28.3 L183.8 28.6 L184.4 28.9 L184.9 29.2 L185.4 29.4 L186.0 29.7 L186.5 30.1 L187.1 30.4 L187.7 30.7 L188.3 31.1 L189.0 31.5 L189.7 32.0 L190.4 32.4 L191.2 32.9 L192.0 33.4 L192.8 33.9 L193.7 34.4 L194.6 35.0 L195.5 35.5 L196.5 36.1 L197.5 36.8 L198.5 37.4 L199.5 38.1 L200.6 38.7 L201.6 39.3 L202.6 39.8 L203.7 40.4 L204.7 40.8 L205.7 41.3 L206.8 41.6 L207.8 42.0 L208.8 42.3 L209.8 42.6 L210.8 42.8 L211.8 43.0 L212.8 43.1 L213.8 43.2 L214.8 43.3 L215.7 43.3 L216.7 43.4 L217.6 43.4 L218.5 43.5 L219.4 43.6 L220.2 43.7 L221.0 43.8 L221.7 43.9 L222.5 44.1 L223.2 44.3 L223.9 44.5 L224.5 44.7 L225.1 44.9 L225.7 45.1 L226.2 45.4 L226.8 45.7 L227.2 45.9 L227.7 46.3 L228.2 46.6 L228.6 47.0 L229.1 47.5 L229.5 48.0 L230.0 48.5 L230.4 49.1 L230.8 49.7 L231.2 50.3 L231.6 51.0 L231.9 51.8 L232.3 52.5 L232.7 53.3 L233.0 54.2 L233.3 55.1 L233.7 56.0 L234.0 56.9 L234.3 57.8 L234.6 58.6 L234.8 59.4 L235.1 60.2 L235.3 60.9 L235.5 61.6 L235.7 62.3 L235.9 63.0 L236.1 63.6 L236.3 64.1 L236.4 64.7 L236.6 65.2 L236.7 65.7 L236.8 66.1 L236.9 66.6 L237.0 67.0 L237.1 67.5 L237.2 68.1 L237.3 68.7 L237.3 69.4 L237.4 70.1 L237.5 70.9 L237.6 71.7 L237.7 72.6 L237.7 73.5 L237.8 74.5 L237.9 75.5 L238.0 76.6 L238.0 77.8 L238.1 78.9 L238.2 80.2 L238.2 81.3 L238.3 82.4 L238.4 83.4 L238.4 84.3 L238.5 85.2 L238.5 85.9 L238.5 86.6 L238.6 87.2 L238.6 87.8 L238.6 88.2 L238.7 88.6 L238.7 88.9 L238.7 89.2 L238.7 89.3 L238.7 89.4 M238.7 89.4 L238.7 89.3 L238.7 89.2 L238.7 88.9 L238.7 88.6 L238.6 88.2 L238.6 87.8 L238.6 87.2 L238.5 86.6 L238.5 85.9 L238.5 85.2 L238.4 84.3 L238.4 83.4 L238.3 82.4 L238.2 81.3 L238.2 80.2 L238.1 78.9 L238.1 77.7 L238.0 76.5 L238.0 75.3 L238.0 74.1 L238.0 73.0 L238.1 71.8 L238.1 70.7 L238.2 69.5 L238.3 68.4 L238.4 67.3 L238.5 66.2 L238.7 65.1 L238.9 64.0 L239.0 63.0 L239.2 61.9 L239.5 60.9 L239.7 59.8 L240.1 58.8 L240.5 57.7 L241.0 56.7 L241.6 55.6 L242.2 54.5 L242.9 53.4 L243.7 52.3 L244.5 51.2 L245.4 50.1 L246.4 49.0 L247.5 47.8 L248.6 46.7 L249.8 45.5 L251.0 44.4 L252.4 43.2 L253.6 42.1 L254.8 41.1 L255.8 40.2 L256.8 39.3 L257.7 38.5 L258.6 37.8 L259.3 37.1 L260.0 36.5 L260.6 36.0 L261.1 35.6 L261.5 35.2 L261.8 34.9 L262.1 34.7 L262.2 34.6 L262.3 34.5 M115.6 58.1 L115.7 58.1 L115.8 58.2 L116.0 58.3 L116.2 58.4 L116.6 58.5 L116.9 58.6 L117.4 58.8 L117.9 59.0 L118.5 59.3 L119.1 59.5 L119.8 59.8 L120.6 60.1 L121.4 60.4 L122.3 60.8 L123.2 61.2 L124.3 61.6 L125.3 62.0 L126.3 62.5 L127.3 62.9 L128.2 63.4 L129.2 63.9 L130.2 64.4 L131.1 64.9 L132.1 65.4 L133.0 65.9 L134.0 66.4 L134.9 67.0 L135.8 67.6 L136.7 68.1 L137.6 68.7 L138.5 69.3 L139.3 70.0 L140.2 70.6 L141.1 71.2 L142.0 71.9 L143.0 72.5 L143.9 73.2 L144.9 73.8 L145.8 74.5 L146.8 75.1 L147.8 75.8 L148.8 76.5 L149.8 77.2 L150.9 77.9 L151.9 78.6 L153.0 79.3 L154.1 80.0 L155.1 80.8 L156.2 81.5 L157.3 82.1 L158.5 82.8 L159.6 83.4 L160.7 84.0 L161.9 84.5 L163.0 85.0 L164.2 85.5 L165.3 86.0 L166.5 86.4 L167.7 86.8 L168.9 87.2 L170.1 87.6 L171.3 87.9 L172.5 88.2 L173.8 88.4 L175.0 88.7 L176.1 88.9 L177.2 89.2 L178.3 89.4 L179.4 89.7 L180.4 89.9 L181.4 90.2 L182.3 90.4 L183.2 90.6 L184.1 90.9 L184.9 91.1 L185.7 91.3 L186.5 91.5 L187.2 91.7 L187.9 91.9 L188.6 92.2 L189.2 92.4 L189.8 92.7 L190.4 93.1 L190.9 93.5 L191.4 93.9 L191.9 94.4 L192.4 95.0 L192.8 95.5 L193.3 96.2 L193.6 96.9 L194.0 97.6 L194.3 98.4 L194.6 99.2 L194.9 100.1 L195.1 101.1 L195.4 102.0 L195.6 103.0 L195.8 104.0 L196.0 104.9 L196.2 105.9 L196.5 106.9 L196.7 107.8 L196.9 108.7 L197.1 109.7 L197.3 110.6 L197.5 111.5 L197.8 112.4 L198.0 113.3 L198.2 114.2 L198.4 115.1 L198.6 116.0 L198.9 116.9 L199.1 117.7 L199.2 118.6 L199.4 119.3 L199.5 120.1 L199.6 120.8 L199.6 121.5 L199.7 122.2 L199.7 122.8 L199.7 123.4 L199.7 123.9 L199.6 124.4 L199.5 124.9 L199.4 125.4 L199.3 125.8 L199.1 126.2 L199.0 126.6 L198.8 126.9 L198.7 127.3 L198.7 127.7 L198.6 128.1 L198.7 128.4 L198.7 128.8 L198.8 129.2 L199.0 129.6 L199.2 130.0 L199.4 130.4 L199.6 130.8 L200.0 131.2 L200.3 131.6 L200.7 132.0 L201.1 132.4 L201.6 132.8 L202.1 133.3 L202.5 133.7 L203.0 134.3 L203.6 134.8 L204.1 135.4 L204.6 136.1 L205.1 136.8 L205.7 137.5 L206.2 138.2 L206.8 139.0 L207.4 139.9 L207.9 140.7 L208.5 141.7 L209.1 142.6 L209.7 143.6 L210.4 144.6 L210.9 145.6 L211.5 146.5 L212.0 147.3 L212.4 148.1 L212.9 148.8 L213.3 149.4 L213.6 150.0 L213.9 150.5 L214.2 151.0 L214.4 151.3 L214.6 151.7 L214.8 151.9 L214.9 152.1 L215.0 152.2 L215.0 152.3 M115.6 58.1 L115.7 58.1 L115.8 58.2 L116.0 58.3 L116.2 58.4 L116.6 58.5 L116.9 58.6 L117.4 58.8 L117.9 59.0 L118.5 59.3 L119.1 59.5 L119.8 59.8 L120.6 60.1 L121.4 60.4 L122.3 60.8 L123.2 61.2 L124.3 61.6 L125.3 62.0 L126.3 62.5 L127.3 62.9 L128.2 63.4 L129.2 63.9 L130.2 64.4 L131.1 64.9 L132.1 65.4 L133.0 65.9 L134.0 66.4 L134.9 67.0 L135.8 67.6 L136.7 68.1 L137.6 68.7 L138.5 69.3 L139.3 70.0 L140.2 70.6 L141.1 71.2 L142.0 71.9 L143.0 72.5 L143.9 73.2 L144.9 73.8 L145.8 74.5 L146.8 75.1 L147.8 75.8 L148.8 76.5 L149.8 77.2 L150.9 77.9 L151.9 78.6 L153.0 79.3 L154.1 80.0 L155.1 80.8 L156.2 81.5 L157.3 82.1 L158.5 82.8 L159.6 83.4 L160.7 84.0 L161.9 84.5 L163.0 85.0 L164.2 85.5 L165.3 86.0 L166.5 86.4 L167.7 86.8 L168.9 87.2 L170.1 87.6 L171.3 87.9 L172.5 88.2 L173.8 88.4 L175.0 88.7 L176.1 88.9 L177.2 89.2 L178.3 89.4 L179.4 89.7 L180.4 89.9 L181.4 90.2 L182.3 90.4 L183.2 90.6 L184.1 90.9 L184.9 91.1 L185.7 91.3 L186.5 91.5 L187.2 91.7 L187.9 91.9 L188.6 92.2 L189.2 92.4 L189.8 92.7 L190.4 93.1 L190.9 93.5 L191.4 93.9 L191.9 94.4 L192.4 95.0 L192.8 95.5 L193.3 96.2 L193.6 96.9 L194.0 97.6 L194.3 98.4 L194.6 99.2 L194.9 100.1 L195.1 101.1 L195.4 102.0 L195.6 103.0 L195.8 104.0 L196.0 104.9 L196.2 105.9 L196.5 106.9 L196.7 107.8 L196.9 108.7 L197.1 109.7 L197.3 110.6 L197.5 111.5 L197.8 112.4 L198.0 113.3 L198.2 114.2 L198.4 115.1 L198.6 116.0 L198.9 116.9 L199.1 117.7 L199.2 118.6 L199.4 119.3 L199.5 120.1 L199.6 120.8 L199.6 121.5 L199.7 122.2 L199.7 122.8 L199.7 123.4 L199.7 123.9 L199.6 124.4 L199.5 124.9 L199.4 125.4 L199.3 125.8 L199.1 126.2 L199.0 126.6 L198.7 127.0 L198.5 127.4 L198.2 127.8 L197.9 128.3 L197.6 128.7 L197.2 129.2 L196.8 129.8 L196.4 130.3 L195.9 130.9 L195.4 131.5 L194.9 132.1 L194.3 132.7 L193.7 133.4 L193.1 134.0 L192.4 134.7 L191.7 135.5 L191.0 136.2 L190.4 136.9 L189.7 137.6 L189.1 138.2 L188.5 138.9 L187.9 139.5 L187.3 140.2 L186.7 140.8 L186.2 141.4 L185.7 142.0 L185.2 142.6 L184.7 143.2 L184.2 143.7 L183.7 144.3 L183.3 144.8 L182.8 145.3 L182.4 145.8 L181.9 146.4 L181.5 146.9 L181.0 147.4 L180.5 148.0 L180.0 148.5 L179.4 149.1 L178.9 149.7 L178.3 150.2 L177.7 150.8 L177.2 151.4 L176.6 152.0 L175.9 152.6 L175.3 153.2 L174.7 153.8 L174.0 154.4 L173.4 155.0 L172.8 155.5 L172.3 156.0 L171.8 156.5 L171.4 156.9 L170.9 157.3 L170.6 157.6 L170.2 157.9 L170.0 158.2 L169.7 158.4 L169.5 158.6 L169.3 158.8 L169.2 158.9 L169.1 159.0 L169.1 159.0 M129.4 185.5 L129.4 185.5 L129.5 185.4 L129.6 185.3 L129.7 185.2 L129.9 185.0 L130.1 184.8 L130.3 184.6 L130.6 184.3 L130.9 184.0 L131.2 183.7 L131.6 183.3 L132.0 182.9 L132.4 182.4 L132.8 182.0 L133.3 181.5 L133.9 180.9 L134.4 180.4 L135.0 179.8 L135.6 179.3 L136.3 178.7 L137.0 178.2 L137.8 177.6 L138.5 177.1 L139.3 176.5 L140.2 175.9 L141.0 175.4 L142.0 174.8 L142.9 174.2 L143.9 173.6 L144.9 173.0 L146.0 172.4 L147.0 171.9 L148.1 171.3 L149.2 170.7 L150.2 170.1 L151.3 169.5 L152.3 168.9 L153.3 168.4 L154.3 167.8 L155.3 167.3 L156.2 166.7 L157.2 166.2 L158.1 165.6 L159.0 165.1 L159.9 164.5 L160.8 164.0 L161.7 163.5 L162.6 162.9 L163.4 162.4 L164.3 161.9 L165.1 161.3 L165.9 160.8 L166.7 160.2 L167.5 159.7 L168.3 159.1 L169.1 158.5 L169.8 158.0 L170.5 157.4 L171.3 156.8 L172.0 156.2 L172.7 155.6 L173.4 155.0 L174.0 154.4 L174.7 153.8 L175.3 153.2 L175.9 152.6 L176.6 152.0 L177.2 151.4 L177.7 150.8 L178.3 150.2 L178.9 149.7 L179.4 149.1 L180.0 148.5 L180.5 148.0 L181.0 147.4 L181.5 146.9 L181.9 146.4 L182.4 145.8 L182.8 145.3 L183.3 144.8 L183.7 144.3 L184.2 143.7 L184.7 143.2 L185.2 142.6 L185.7 142.0 L186.2 141.4 L186.7 140.8 L187.3 140.2 L187.9 139.5 L188.5 138.9 L189.1 138.2 L189.7 137.6 L190.4 136.9 L191.0 136.2 L191.7 135.5 L192.4 134.7 L193.1 134.1 L193.7 133.5 L194.4 133.0 L195.0 132.5 L195.7 132.2 L196.3 131.9 L196.9 131.7 L197.4 131.5 L198.0 131.4 L198.6 131.4 L199.1 131.5 L199.6 131.6 L200.1 131.8 L200.6 132.1 L201.1 132.4 L201.6 132.8 L202.1 133.3 L202.5 133.7 L203.0 134.3 L203.6 134.8 L204.1 135.4 L204.6 136.1 L205.1 136.8 L205.7 137.5 L206.2 138.2 L206.8 139.0 L207.4 139.9 L207.9 140.7 L208.5 141.7 L209.1 142.6 L209.7 143.6 L210.4 144.6 L210.9 145.6 L211.5 146.5 L212.0 147.3 L212.4 148.1 L212.9 148.8 L213.3 149.4 L213.6 150.0 L213.9 150.5 L214.2 151.0 L214.4 151.3 L214.6 151.7 L214.8 151.9 L214.9 152.1 L215.0 152.2 L215.0 152.3 M129.4 185.5 L129.4 185.5 L129.5 185.4 L129.6 185.3 L129.7 185.2 L129.9 185.0 L130.1 184.8 L130.3 184.6 L130.6 184.3 L130.9 184.0 L131.2 183.7 L131.6 183.3 L132.0 182.9 L132.4 182.4 L132.8 182.0 L133.3 181.5 L133.9 180.9 L134.4 180.4 L135.0 179.8 L135.6 179.3 L136.3 178.7 L137.0 178.2 L137.8 177.6 L138.5 177.1 L139.3 176.5 L140.2 175.9 L141.0 175.4 L142.0 174.8 L142.9 174.2 L143.9 173.6 L144.9 173.0 L146.0 172.4 L147.0 171.9 L148.1 171.3 L149.2 170.7 L150.2 170.1 L151.3 169.5 L152.3 168.9 L153.3 168.4 L154.3 167.8 L155.3 167.3 L156.2 166.7 L157.2 166.2 L158.1 165.6 L159.0 165.1 L159.9 164.5 L160.8 164.0 L161.7 163.5 L162.6 162.9 L163.4 162.4 L164.2 162.0 L164.9 161.6 L165.5 161.2 L166.1 160.8 L166.7 160.5 L167.1 160.2 L167.6 159.9 L168.0 159.7 L168.3 159.5 L168.6 159.3 L168.8 159.2 L168.9 159.1 L169.0 159.0 L169.1 159.0 M119.4 195.1 L119.4 195.1 L119.5 195.0 L119.5 195.0 L119.6 194.9 L119.7 194.8 L119.8 194.7 L119.9 194.6 L120.0 194.5 L120.2 194.3 L120.3 194.1 L120.5 193.9 L120.7 193.7 L121.0 193.5 L121.2 193.3 L121.5 193.0 L121.7 192.7 L122.0 192.4 L122.3 192.1 L122.6 191.9 L122.9 191.6 L123.2 191.3 L123.5 191.0 L123.8 190.7 L124.1 190.4 L124.4 190.1 L124.7 189.8 L125.1 189.5 L125.4 189.2 L125.7 188.8 L126.1 188.5 L126.4 188.2 L126.8 187.9 L127.1 187.6 L127.5 187.2 L127.9 186.9 L128.3 186.5 L128.7 186.1 L129.1 185.7 L129.5 185.3 L130.0 184.8 L130.4 184.4 L130.9 184.0 L131.3 183.5 L131.8 183.0 L132.3 182.5 L132.8 182.0 L133.3 181.5 L133.9 180.9 L134.4 180.4 L135.0 179.8 L135.6 179.3 L136.3 178.7 L137.0 178.2 L137.8 177.6 L138.5 177.1 L139.3 176.5 L140.2 175.9 L141.0 175.4 L142.0 174.8 L142.9 174.2 L143.9 173.6 L144.9 173.0 L146.0 172.4 L147.0 171.9 L148.1 171.3 L149.2 170.7 L150.2 170.1 L151.3 169.5 L152.3 168.9 L153.3 168.4 L154.3 167.8 L155.3 167.3 L156.2 166.7 L157.2 166.2 L158.1 165.6 L159.0 165.1 L159.9 164.5 L160.8 164.0 L161.7 163.5 L162.6 162.9 L163.4 162.4 L164.3 161.9 L165.1 161.3 L165.9 160.8 L166.7 160.2 L167.5 159.7 L168.3 159.1 L169.1 158.5 L169.8 158.0 L170.5 157.4 L171.3 156.8 L172.0 156.2 L172.7 155.6 L173.4 155.0 L174.0 154.4 L174.7 153.8 L175.3 153.2 L175.9 152.6 L176.6 152.0 L177.2 151.4 L177.7 150.8 L178.3 150.2 L178.9 149.7 L179.4 149.1 L180.0 148.5 L180.5 148.0 L181.0 147.4 L181.5 146.9 L181.9 146.4 L182.4 145.8 L182.8 145.3 L183.3 144.8 L183.7 144.3 L184.2 143.7 L184.7 143.2 L185.2 142.6 L185.7 142.0 L186.2 141.4 L186.7 140.8 L187.3 140.2 L187.9 139.5 L188.5 138.9 L189.1 138.2 L189.7 137.6 L190.4 136.9 L191.0 136.2 L191.7 135.5 L192.4 134.7 L193.1 134.1 L193.7 133.5 L194.4 133.0 L195.0 132.5 L195.7 132.2 L196.3 131.9 L196.9 131.7 L197.4 131.5 L198.0 131.4 L198.6 131.4 L199.1 131.5 L199.6 131.6 L200.1 131.8 L200.6 132.1 L201.1 132.4 L201.6 132.8 L202.1 133.3 L202.5 133.7 L203.0 134.3 L203.6 134.8 L204.1 135.4 L204.6 136.1 L205.1 136.8 L205.7 137.5 L206.2 138.2 L206.8 139.0 L207.4 139.9 L207.9 140.7 L208.5 141.7 L209.1 142.6 L209.7 143.6 L210.4 144.6 L210.9 145.6 L211.5 146.5 L212.0 147.3 L212.4 148.1 L212.9 148.8 L213.3 149.4 L213.6 150.0 L213.9 150.5 L214.2 151.0 L214.4 151.3 L214.6 151.7 L214.8 151.9 L214.9 152.1 L215.0 152.2 L215.0 152.3 M119.4 195.1 L119.4 195.1 L119.5 195.0 L119.5 195.0 L119.6 194.9 L119.7 194.8 L119.8 194.7 L119.9 194.6 L120.0 194.5 L120.2 194.3 L120.3 194.1 L120.5 193.9 L120.7 193.7 L121.0 193.5 L121.2 193.3 L121.5 193.0 L121.7 192.7 L122.0 192.4 L122.3 192.1 L122.6 191.9 L122.9 191.6 L123.2 191.3 L123.5 191.0 L123.8 190.7 L124.1 190.4 L124.4 190.1 L124.7 189.8 L125.1 189.5 L125.4 189.2 L125.7 188.8 L126.1 188.5 L126.4 188.2 L126.8 187.9 L127.1 187.6 L127.5 187.2 L127.9 186.9 L128.3 186.5 L128.7 186.1 L129.1 185.7 L129.5 185.3 L130.0 184.8 L130.4 184.4 L130.9 184.0 L131.3 183.5 L131.8 183.0 L132.3 182.5 L132.8 182.0 L133.3 181.5 L133.9 180.9 L134.4 180.4 L135.0 179.8 L135.6 179.3 L136.3 178.7 L137.0 178.2 L137.8 177.6 L138.5 177.1 L139.3 176.5 L140.2 175.9 L141.0 175.4 L142.0 174.8 L142.9 174.2 L143.9 173.6 L144.9 173.0 L146.0 172.4 L147.0 171.9 L148.1 171.3 L149.2 170.7 L150.2 170.1 L151.3 169.5 L152.3 168.9 L153.3 168.4 L154.3 167.8 L155.3 167.3 L156.2 166.7 L157.2 166.2 L158.1 165.6 L159.0 165.1 L159.9 164.5 L160.8 164.0 L161.7 163.5 L162.6 162.9 L163.4 162.4 L164.2 162.0 L164.9 161.6 L165.5 161.2 L166.1 160.8 L166.7 160.5 L167.1 160.2 L167.6 159.9 L168.0 159.7 L168.3 159.5 L168.6 159.3 L168.8 159.2 L168.9 159.1 L169.0 159.0 L169.1 159.0 M238.7 89.4 L238.8 89.4 L238.9 89.5 L239.1 89.7 L239.3 89.9 L239.6 90.1 L239.9 90.4 L240.4 90.7 L240.8 91.0 L241.4 91.5 L242.0 91.9 L242.6 92.4 L243.3 93.0 L244.1 93.6 L244.9 94.2 L245.8 94.9 L246.8 95.6 L247.6 96.3 L248.4 97.1 L249.2 97.8 L249.8 98.5 L250.4 99.3 L250.8 100.0 L251.2 100.7 L251.6 101.5 L251.8 102.2 L252.0 102.9 L252.1 103.6 L252.1 104.4 L252.1 105.1 L251.9 105.8 L251.7 106.5 L251.4 107.3 L251.1 108.1 L250.7 108.9 L250.3 109.8 L249.9 110.8 L249.5 111.9 L249.0 113.0 L248.5 114.2 L247.9 115.4 L247.4 116.7 L246.7 118.1 L246.1 119.5 L245.4 121.0 L244.7 122.6 L244.0 124.2 L243.2 125.9 L242.5 127.7 L241.6 129.4 L240.8 131.0 L239.9 132.6 L238.9 134.1 L238.0 135.5 L237.0 136.9 L235.9 138.2 L234.9 139.4 L233.8 140.6 L232.6 141.7 L231.5 142.7 L230.2 143.7 L229.0 144.6 L227.7 145.5 L226.4 146.2 L225.1 147.0 L223.8 147.6 L222.6 148.2 L221.6 148.8 L220.5 149.4 L219.6 149.9 L218.8 150.3 L218.0 150.7 L217.4 151.1 L216.8 151.4 L216.3 151.6 L215.8 151.9 L215.5 152.0 L215.3 152.2 L215.1 152.3 L215.0 152.3 M238.7 89.4 L238.8 89.4 L238.9 89.5 L239.1 89.7 L239.3 89.9 L239.6 90.1 L239.9 90.4 L240.4 90.7 L240.8 91.0 L241.4 91.5 L242.0 91.9 L242.6 92.4 L243.3 93.0 L244.1 93.6 L244.9 94.2 L245.8 94.9 L246.8 95.6 L247.6 96.3 L248.4 97.1 L249.2 97.8 L249.8 98.5 L250.4 99.3 L250.8 100.0 L251.2 100.7 L251.6 101.5 L251.8 102.2 L252.0 102.9 L252.1 103.6 L252.1 104.4 L252.1 105.1 L251.9 105.8 L251.7 106.5 L251.4 107.3 L251.1 108.1 L250.7 108.9 L250.3 109.8 L249.9 110.8 L249.5 111.9 L249.0 113.0 L248.5 114.2 L247.9 115.4 L247.4 116.7 L246.7 118.1 L246.1 119.5 L245.4 121.0 L244.7 122.6 L244.0 124.2 L243.2 125.9 L242.5 127.7 L241.6 129.4 L240.8 131.0 L239.9 132.6 L238.9 134.1 L238.0 135.5 L237.0 136.9 L235.9 138.2 L234.9 139.4 L233.8 140.6 L232.6 141.7 L231.5 142.7 L230.2 143.7 L229.0 144.6 L227.7 145.5 L226.4 146.2 L225.1 147.0 L223.8 147.6 L222.5 148.1 L221.3 148.4 L220.2 148.7 L219.0 148.9 L218.0 149.0 L216.9 148.9 L216.0 148.7 L215.0 148.5 L214.1 148.1 L213.3 147.6 L212.5 147.0 L211.7 146.3 L211.0 145.5 L210.4 144.6 L209.7 143.6 L209.1 142.6 L208.5 141.7 L207.9 140.7 L207.4 139.9 L206.8 139.0 L206.2 138.2 L205.7 137.5 L205.1 136.8 L204.6 136.1 L204.1 135.4 L203.6 134.8 L203.0 134.3 L202.5 133.7 L202.1 133.3 L201.6 132.8 L201.1 132.4 L200.6 132.1 L200.1 131.8 L199.6 131.6 L199.1 131.5 L198.6 131.4 L198.0 131.4 L197.4 131.5 L196.9 131.7 L196.3 131.9 L195.7 132.2 L195.0 132.5 L194.4 133.0 L193.7 133.5 L193.1 134.1 L192.4 134.7 L191.7 135.5 L191.0 136.2 L190.4 136.9 L189.7 137.6 L189.1 138.2 L188.5 138.9 L187.9 139.5 L187.3 140.2 L186.7 140.8 L186.2 141.4 L185.7 142.0 L185.2 142.6 L184.7 143.2 L184.2 143.7 L183.7 144.3 L183.3 144.8 L182.8 145.3 L182.4 145.8 L181.9 146.4 L181.5 146.9 L181.0 147.4 L180.5 148.0 L180.0 148.5 L179.4 149.1 L178.9 149.7 L178.3 150.2 L177.7 150.8 L177.2 151.4 L176.6 152.0 L175.9 152.6 L175.3 153.2 L174.7 153.8 L174.0 154.4 L173.4 155.0 L172.8 155.5 L172.3 156.0 L171.8 156.5 L171.4 156.9 L170.9 157.3 L170.6 157.6 L170.2 157.9 L170.0 158.2 L169.7 158.4 L169.5 158.6 L169.3 158.8 L169.2 158.9 L169.1 159.0 L169.1 159.0 M215.0 152.3 L215.0 152.2 L214.9 152.1 L214.8 151.9 L214.6 151.7 L214.4 151.3 L214.2 151.0 L213.9 150.5 L213.6 150.0 L213.3 149.4 L212.9 148.8 L212.4 148.1 L212.0 147.3 L211.5 146.5 L210.9 145.6 L210.4 144.6 L209.7 143.6 L209.1 142.6 L208.5 141.7 L207.9 140.7 L207.4 139.9 L206.8 139.0 L206.2 138.2 L205.7 137.5 L205.1 136.8 L204.6 136.1 L204.1 135.4 L203.6 134.8 L203.0 134.3 L202.5 133.7 L202.1 133.3 L201.6 132.8 L201.1 132.4 L200.6 132.1 L200.1 131.8 L199.6 131.6 L199.1 131.5 L198.6 131.4 L198.0 131.4 L197.4 131.5 L196.9 131.7 L196.3 131.9 L195.7 132.2 L195.0 132.5 L194.4 133.0 L193.7 133.5 L193.1 134.1 L192.4 134.7 L191.7 135.5 L191.0 136.2 L190.4 136.9 L189.7 137.6 L189.1 138.2 L188.5 138.9 L187.9 139.5 L187.3 140.2 L186.7 140.8 L186.2 141.4 L185.7 142.0 L185.2 142.6 L184.7 143.2 L184.2 143.7 L183.7 144.3 L183.3 144.8 L182.8 145.3 L182.4 145.8 L181.9 146.4 L181.5 146.9 L181.0 147.4 L180.5 148.0 L180.0 148.5 L179.4 149.1 L178.9 149.7 L178.3 150.2 L177.7 150.8 L177.2 151.4 L176.6 152.0 L175.9 152.6 L175.3 153.2 L174.7 153.8 L174.0 154.4 L173.4 155.0 L172.8 155.5 L172.3 156.0 L171.8 156.5 L171.4 156.9 L170.9 157.3 L170.6 157.6 L170.2 157.9 L170.0 158.2 L169.7 158.4 L169.5 158.6 L169.3 158.8 L169.2 158.9 L169.1 159.0 L169.1 159.0\" stroke=\"#24403B\" stroke-opacity=\".2\" stroke-width=\"1.2\" fill=\"none\"/><circle cx=\"61.1\" cy=\"112.1\" r=\"1.6\" fill=\"#24403B\" opacity=\".55\"/><text x=\"64.1\" y=\"109.6\" class=\"d-ital d-petit\" font-size=\"7.5\">Saint‑Étienne</text><circle cx=\"117.3\" cy=\"97.0\" r=\"1.6\" fill=\"#24403B\" opacity=\".55\"/><text x=\"120.3\" y=\"94.5\" class=\"d-ital d-petit\" font-size=\"7.5\">Vienne</text><circle cx=\"23.7\" cy=\"12.3\" r=\"1.6\" fill=\"#24403B\" opacity=\".55\"/><text x=\"26.7\" y=\"9.8\" class=\"d-ital d-petit\" font-size=\"7.5\">Roanne</text><circle cx=\"93.6\" cy=\"144.2\" r=\"1.6\" fill=\"#24403B\" opacity=\".55\"/><text x=\"96.6\" y=\"141.7\" class=\"d-ital d-petit\" font-size=\"7.5\">Annonay</text><circle cx=\"163.3\" cy=\"86.2\" r=\"1.6\" fill=\"#24403B\" opacity=\".55\"/><text x=\"166.3\" y=\"83.7\" class=\"d-ital d-petit\" font-size=\"7.5\">Bourgoin</text><circle cx=\"200.5\" cy=\"123.5\" r=\"1.6\" fill=\"#24403B\" opacity=\".55\"/><text x=\"203.5\" y=\"121.0\" class=\"d-ital d-petit\" font-size=\"7.5\">Voiron</text><circle cx=\"137.8\" cy=\"176.9\" r=\"1.6\" fill=\"#24403B\" opacity=\".55\"/><text x=\"140.8\" y=\"174.4\" class=\"d-ital d-petit\" font-size=\"7.5\">Romans</text><circle cx=\"237.6\" cy=\"69.7\" r=\"1.6\" fill=\"#24403B\" opacity=\".55\"/><text x=\"240.6\" y=\"67.2\" class=\"d-ital d-petit\" font-size=\"7.5\">Aix‑les‑Bains</text><circle cx=\"173.5\" cy=\"25.2\" r=\"1.6\" fill=\"#24403B\" opacity=\".55\"/><text x=\"176.5\" y=\"22.7\" class=\"d-ital d-petit\" font-size=\"7.5\">Ambérieu</text><path d=\"M110.4 22.0 L126.4 14.0 M112.4 26.0 L128.4 18.0\" stroke=\"#24403B\" stroke-width=\"1.6\"/><path d=\"M111.4 24.0 L127.4 16.0\" stroke=\"#FBF6EA\" stroke-width=\"2.4\"/><text x=\"106.4\" y=\"19.0\" text-anchor=\"end\" class=\"d-ital\" font-size=\"11\">vers Paris</text><g class=\"rose\" data-action=\"rose\" style=\"transform-origin:296px 196px\"><circle cx=\"296\" cy=\"196\" r=\"16\" fill=\"transparent\"/><circle cx=\"296\" cy=\"196\" r=\"9\" fill=\"none\" stroke=\"#B79B5E\" stroke-width=\".7\"/><path d=\"M296 181 L299 196 L296 211 L293 196Z\" fill=\"#24403B\"/><path d=\"M281 196 L296 199 L311 196 L296 193Z\" fill=\"#FBF6EA\" stroke=\"#24403B\" stroke-width=\".8\"/><text x=\"296\" y=\"177\" text-anchor=\"middle\" class=\"d-ital\" font-size=\"9\">N</text></g>";
  const CARTE_XY = {"N0": [113.4, 10.0], "N1": [128.5, 29.9], "N2": [137.8, 51.4], "STEX": [140.8, 64.5], "PDa": [123.8, 44.8], "PD": [115.6, 58.1], "SQF": [144.7, 77.9], "BOU": [163.3, 86.2], "TDP": [183.0, 90.4], "SAG": [193.5, 93.7], "SAG2": [197.0, 109.4], "VOI": [200.5, 123.5], "MOI": [197.6, 129.3], "VOR": [205.1, 135.9], "GRE": [215.0, 152.3], "LM1": [134.3, 92.8], "LM2": [129.6, 126.0], "LM3": [128.5, 159.1], "VTGV": [129.4, 185.5], "VV1": [123.8, 190.6], "VVIL": [119.4, 195.1], "CH1": [209.8, 94.5], "CH2": [222.5, 94.5], "CHA": [238.7, 89.4], "AIX": [237.6, 69.7], "AN1": [241.1, 53.1], "ANN": [262.3, 34.5], "J1": [119.6, 18.3], "BG1": [143.6, 19.1], "BG2": [163.3, 22.4], "AMB": [173.5, 25.2], "SRB": [181.9, 27.4], "TEN": [190.6, 32.4], "VIR": [207.4, 43.1], "CUL": [223.1, 43.5], "CHD": [230.9, 48.1], "BRS": [236.1, 63.0], "ROM": [137.8, 176.9], "RS1": [155.2, 167.4], "STM": [169.1, 159.0], "VIN": [179.6, 149.2], "VM1": [186.5, 140.9], "MON": [253.9, 101.1], "PON": [249.2, 112.7], "BRI": [236.5, 140.9], "LG1": [131.9, 64.7], "LG2": [145.9, 74.6]};
  const CARTE_TGV = {"LYON (intramuros)": ["N0", "N1", "PDa", "PD"], "LYON ST EXUPERY TGV.": ["N0", "N1", "N2", "STEX"], "VALENCE TGV AUVERGNE RHONE ALPES": ["N0", "N1", "N2", "STEX", "LM1", "LM2", "LM3", "VTGV"], "VALENCE VILLE": ["N0", "N1", "N2", "STEX", "LM1", "LM2", "LM3", "VTGV", "VV1", "VVIL"], "GRENOBLE": ["N0", "N1", "N2", "STEX", "SQF", "BOU", "TDP", "SAG", "SAG2", "VOI", "MOI", "VOR", "GRE"], "CHAMBERY CHALLES LES EAUX": ["N0", "J1", "BG1", "BG2", "AMB", "SRB", "TEN", "VIR", "CUL", "CHD", "BRS", "AIX", "CHA"], "ANNECY": [["N0", "J1", "BG1", "BG2", "AMB", "SRB", "TEN", "VIR", "CUL", "CHD", "BRS", "AIX", "CHA"], ["CHA", "AIX", "AN1", "ANN"]]};
  const CARTE_TER = {"LYON>GRENOBLE": ["PD", "LG1", "LG2", "BOU", "TDP", "SAG", "SAG2", "VOI", "MOI", "VOR", "GRE"], "LYON>ST_MARCELLIN": ["PD", "LG1", "LG2", "BOU", "TDP", "SAG", "SAG2", "VOI", "MOI", "VM1", "VIN", "STM"], "VALENCE_TGV>GRENOBLE": ["VTGV", "ROM", "RS1", "STM", "VIN", "VM1", "MOI", "VOR", "GRE"], "VALENCE_TGV>ST_MARCELLIN": ["VTGV", "ROM", "RS1", "STM"], "VALENCE_VILLE>GRENOBLE": ["VVIL", "VV1", "VTGV", "ROM", "RS1", "STM", "VIN", "VM1", "MOI", "VOR", "GRE"], "VALENCE_VILLE>ST_MARCELLIN": ["VVIL", "VV1", "VTGV", "ROM", "RS1", "STM"], "CHAMBERY>GRENOBLE": ["CHA", "MON", "PON", "BRI", "GRE"], "CHAMBERY>ST_MARCELLIN": ["CHA", "MON", "PON", "BRI", "GRE", "VOR", "MOI", "VM1", "VIN", "STM"], "GRENOBLE>ST_MARCELLIN": ["GRE", "VOR", "MOI", "VM1", "VIN", "STM"]};
  const CARTE_VILLES = {"Grenoble": "GRE", "Saint Marcellin": "STM", "Lyon": "PD", "Valence": "VTGV", "Chambéry": "CHA", "Annecy": "ANN"};
  const CARTE_ETIQ = {"Grenoble": [8, -2, "start"], "Saint Marcellin": [7, 14, "start"], "Lyon": [-8, 5, "end"], "Valence": [-8, 5, "end"], "Chambéry": [8, 4, "start"], "Annecy": [-8, -3, "end"]};
  const CARTE_GARE = {"GRENOBLE": "GRE", "LYON (intramuros)": "PD", "LYON ST EXUPERY TGV.": "STEX", "VALENCE TGV AUVERGNE RHONE ALPES": "VTGV", "VALENCE VILLE": "VVIL", "CHAMBERY CHALLES LES EAUX": "CHA", "ANNECY": "ANN"};
  const CARTE_NOEUD = {"LYON": "PD", "VALENCE_TGV": "VTGV", "VALENCE_VILLE": "VVIL", "CHAMBERY": "CHA", "GRENOBLE": "GRE"};
  /* fin du bloc généré */

  /* Rails arrondis : on coupe les coins quatre fois de suite (méthode de Chaikin). */
  function arrondir(pts) {
    let p = pts;
    for (let k = 0; k < 4; k++) {
      const q = [p[0]];
      for (let i = 0; i < p.length - 1; i++) {
        const [ax, ay] = p[i];
        const [bx, by] = p[i + 1];
        q.push([0.75 * ax + 0.25 * bx, 0.75 * ay + 0.25 * by], [0.25 * ax + 0.75 * bx, 0.25 * ay + 0.75 * by]);
      }
      q.push(p[p.length - 1]);
      p = q;
    }
    return p;
  }
  const versChemin = (pts) => `M${pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L')}`;
  const longueur = (pts) => pts.slice(1).reduce((l, p, i) => l + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);

  const GARE_HABITUELLE = { Grenoble: 'GRENOBLE', Lyon: 'LYON (intramuros)', Valence: 'VALENCE TGV AUVERGNE RHONE ALPES', 'Chambéry': 'CHAMBERY CHALLES LES EAUX', Annecy: 'ANNECY' };

  /* Le chemin d'un côté : TGV jusqu'à sa gare d'arrivée, puis TER s'il y a une correspondance. */
  function itineraire(sens, x, ville) {
    let tgv = null;
    let ter = null;
    let noeud = null;
    if (x) {
      const brut = sens === 'aller' ? x.tgv.destination : x.tgv.origine;
      tgv = CARTE_TGV[brut] || null;
      if (tgv && x.type === 'via') {
        noeud = NOEUD_TGV[brut];
        ter = CARTE_TER[`${noeud}>${FINALES[ville]}`] || null;
      }
    }
    if (!tgv) {
      if (ville === 'Saint Marcellin') {
        tgv = CARTE_TGV.GRENOBLE;
        noeud = 'GRENOBLE';
        ter = CARTE_TER['GRENOBLE>ST_MARCELLIN'];
      } else tgv = CARTE_TGV[GARE_HABITUELLE[ville]];
    }
    const pts = (l) => arrondir(l.map((k) => CARTE_XY[k]));
    // un trajet TGV peut avoir plusieurs morceaux (Annecy : descente jusqu'à Chambéry, puis remontée par Aix)
    const segments = typeof tgv[0] === 'string' ? [tgv] : tgv;
    const morceaux = segments.map((seg) => ({ mode: 'tgv', pts: pts(seg) }));
    const passages = segments.slice(0, -1).map((seg) => seg[seg.length - 1]);
    if (ter) morceaux.push({ mode: 'ter', pts: pts(ter) });
    if (sens === 'retour') {
      morceaux.reverse();
      for (const m of morceaux) m.pts = [...m.pts].reverse();
    }
    const dernier = segments[segments.length - 1];
    const bout = ter ? ter[ter.length - 1] : dernier[dernier.length - 1];
    return { morceaux, arret: ter ? CARTE_NOEUD[noeud] : null, bout, passages };
  }

  function traitCarte(d, mode, actif) {
    if (!actif) return `<path d="${d}" stroke="#B79B5E" stroke-width="1.4" fill="none" stroke-dasharray="2 4"/>`;
    return mode === 'tgv'
      ? `<path d="${d}" stroke="#24403B" stroke-width="5.5" fill="none" stroke-linejoin="round"/><path d="${d}" stroke="#FBF6EA" stroke-width="3" fill="none" stroke-dasharray="7 7"/>`
      : `<path d="${d}" stroke="#24403B" stroke-width="3.6" fill="none" stroke-linejoin="round"/><path d="${d}" stroke="#FBF6EA" stroke-width="1.6" fill="none" stroke-dasharray="3 3"/>`;
  }

  /* Le repère cuivre : debut et fin en fractions du cycle, duree du cycle en secondes. */
  function repere(d, debut, fin, duree) {
    const f = (v) => v.toFixed(4);
    return `<g opacity="0"><circle r="8.5" fill="#C8662F" opacity=".25"/><circle r="4.5" fill="#C8662F" stroke="#24403B" stroke-width=".8"/>
<animateMotion path="${d}" dur="${duree.toFixed(2)}s" repeatCount="indefinite" keyPoints="0;0;1;1" keyTimes="0;${f(debut)};${f(fin)};1" calcMode="linear"/>
<animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="0;${f(Math.max(0, debut - 0.0005))};${f(debut)};${f(fin)};${f(Math.min(0.9999, fin + 0.004))};1" dur="${duree.toFixed(2)}s" repeatCount="indefinite"/></g>`;
  }

  /* Petit mot posé près d'une gare de correspondance. */
  const MOT_ARRET = { GRE: [224, 160, 'start'], CHA: [239, 107, 'middle'], PD: [116, 45, 'middle'], VTGV: [137, 198, 'start'], VVIL: [113, 214, 'middle'] };
  const PETITES_GARES = { STEX: ['St‑Exupéry', 148, 62, 'start'], VVIL: ['Valence Ville', 105, 204, 'end'] };

  function dessinCarte(a0, r0) {
    const r = etat.r;
    const cotes = r.mode === 'ar' ? [['aller', a0, r.aller], ['retour', r0, r.retour]] : [[r.sensSimple, a0, r.aller]];
    const VITESSE = 55; // pixels par seconde, la même pour tous les trajets
    let routes = '';
    const choisies = new Map();
    const arrets = new Set();
    const bouts = new Set();
    const passages = new Set();
    const etapes = [];
    let t = 0.3;
    for (const [sens, x, ville] of cotes) {
      const it = itineraire(sens, x, ville);
      choisies.set(ville, (choisies.get(ville) || false) || !!x);
      if (x) {
        if (it.arret) arrets.add(it.arret);
        bouts.add(it.bout);
      }
      for (const p of it.passages) passages.add(p);
      it.morceaux.forEach((m, i) => {
        const d = versChemin(m.pts);
        routes += traitCarte(d, m.mode, !!x);
        if (!x) return;
        if (i > 0) t += 0.45; // petite pause à la correspondance
        const duree = longueur(m.pts) / VITESSE;
        etapes.push([d, t, t + duree]);
        t += duree;
      });
      t += 0.9; // entre l'aller et le retour
    }
    const cycle = Math.max(t + 0.4, 2);
    const reperes = etapes.map(([d, a, b]) => repere(d, a / cycle, b / cycle, cycle)).join('');
    let gares = '';
    for (const [ville, cle] of Object.entries(CARTE_VILLES)) {
      const [x, y] = CARTE_XY[cle];
      const [dx, dy, ancre] = CARTE_ETIQ[ville];
      const choisie = choisies.has(ville);
      const zero = choisies.get(ville) === true;
      gares += `<g opacity="${choisie || arrets.has(cle) || passages.has(cle) ? 1 : 0.45}"><circle cx="${x}" cy="${y}" r="5" fill="#FBF6EA" stroke="#24403B" stroke-width="1.6"/><circle cx="${x}" cy="${y}" r="1.9" fill="${zero ? '#C8662F' : '#24403B'}"/><text x="${x + dx}" y="${y + dy}" text-anchor="${ancre}" class="d-ital" font-size="${choisie ? 13.5 : 10.5}">${esc(court(ville))}</text></g>`;
    }
    for (const [cle, [nom, lx, ly, ancre]] of Object.entries(PETITES_GARES)) {
      if (!bouts.has(cle) && !arrets.has(cle)) continue;
      const [x, y] = CARTE_XY[cle];
      gares += `<circle cx="${x}" cy="${y}" r="4.2" fill="#FBF6EA" stroke="#24403B" stroke-width="1.5"/><circle cx="${x}" cy="${y}" r="1.6" fill="#C8662F"/><text x="${lx}" y="${ly}" text-anchor="${ancre}" class="d-ital" font-size="10">${nom}</text>`;
    }
    for (const cle of arrets) {
      const [x, y] = CARTE_XY[cle];
      const [mx, my, ancre] = MOT_ARRET[cle] || [x, y - 12, 'middle'];
      gares += `<circle cx="${x}" cy="${y}" r="9" fill="none" stroke="#C8662F" stroke-width="1.3" stroke-dasharray="2.5 2"/><text x="${mx}" y="${my}" text-anchor="${ancre}" class="d-mono" style="fill:#9C4519;font-size:8px">CORRESP.</text>`;
    }
    return `<svg viewBox="0 0 322 222" role="img" aria-label="Carte du trajet">${CARTE_FOND}${routes}${reperes}${gares}</svg>`;
  }

  function majVerdict(ev) {
    const r = etat.r;
    let oui = false;
    let titre;
    let sous;
    let heures = null;
    if (r.mode === 'simple') {
      if (ev.zA.length) {
        oui = true;
        titre = ev.zA.length === 1 ? 'Un train à 0€' : `${ev.zA.length} trains à 0€`;
        sous = ev.zA.slice(0, 4).map(quand).join(' · ');
      } else {
        titre = 'Pas encore de trajets';
        sous = 'rien à 0€ dans ta plage pour l’instant';
      }
    } else if (ev.meilleur) {
      const { a, r: re, sur } = ev.meilleur;
      oui = true;
      heures = sur;
      const lieu = r.aller === r.retour ? `à ${esc(court(r.aller))}` : `entre ${esc(court(r.aller))} et ${esc(court(r.retour))}`;
      titre = `<span class="v-n">${sur}</span> h ${lieu}`;
      sous = `aller ${quand(a)} · retour ${quand(re)}`;
    } else if (ev.zA.length) {
      titre = 'L’aller est là, le retour manque';
      sous = `aller ${quand(ev.zA[0])} · pas encore de retour à 0€`;
    } else if (ev.zR.length) {
      titre = 'Le retour est là, l’aller manque';
      sous = `retour ${quand(ev.zR[0])} · pas encore d’aller à 0€`;
    } else {
      titre = 'Pas encore de trajets';
      sous = 'rien à 0€ dans tes plages pour l’instant';
    }
    if (!publie(etat.vendredi)) {
      oui = false;
      heures = null;
      titre = 'Pas encore publié';
      const ouverture = ajouterJours(etat.vendredi, -30);
      sous = `la SNCF ouvre les places MAX 30 jours avant : à partir du ${jourDuMois(ouverture)} ${MOIS_COURT[moisDe(ouverture)]}`;
    }
    const raccourci = oui ? '' : '<button type="button" class="v-antic" data-action="antic-depuis-recherche">Noter une anticipation</button>';
    // Le titre contient déjà ce qui vient de esc() ou du texte fixe.
    const html = `<div class="verdict ${oui ? 'oui' : 'non'}"><div class="v-texte"><span class="v-titre">${heures === null ? esc(titre) : titre}</span><span class="v-sous">${esc(sous)}</span>${raccourci}</div></div>`;
    const avant = etat.heures;
    poserDoux('verdict', html);
    if (heures !== null && avant != null) compter(document.querySelector('#verdict .v-n'), avant, heures);
    etat.heures = heures;
  }

  const enDuree = (min) => `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;

  /* La barre TGV / TER d'une correspondance, longueurs proportionnelles aux durées. */
  function etapes(x) {
    const cols = x.etapes.map((e) => `${Math.max(e.min, 15)}fr`).join(' ');
    const traits = x.etapes.map((e) => `<span class="e-trait ${e.mode.toLowerCase()}"></span>`).join('');
    const mots = x.etapes.map((e, i) => `<span class="e-mot${i ? ' droite' : ''}">${e.mode}${e.zero ? ' 0€' : ''}</span>`).join('');
    return `<span class="etapes" style="grid-template-columns:${cols}" aria-hidden="true">${traits}${mots}</span>`;
  }

  /* La carte d'un train : un billet imprimé. En tête le sens, le jour et le N° du train, puis les horaires,
     les gares, la durée ; le talon « 0€ » à droite ouvre SNCF Connect. */
  function rangee(x) {
    const parti = estParti(x.date, x.depart);
    const sens = x.sens === 'retour' ? 'RETOUR' : 'ALLER';
    const corps = `<span class="b-corps"><span class="b-cadre">
<span class="b-haut"><span>${sens} · ${jourBillet(x.date)}</span><span>N° ${esc(x.tgv.train)}</span></span>
<span class="b-h"><b>${heure(x.depart)}</b><i>→</i><b>${x.arrivee}</b></span>
<span class="b-gares">${esc(x.gareDe)} → ${esc(x.gareA)}</span>
<span class="b-milieu">${enDuree(x.duree)} · ${esc(x.precision)}</span>${x.type === 'via' ? etapes(x) : ''}</span></span>`;
    if (parti) return `<div class="billet ${x.type} parti"><span class="b-papier">${corps}<span class="b-talon">PARTI</span></span></div>`;
    const quoi = `${heure(x.depart)} ${x.gareDe} vers ${x.gareA}, arrivée ${x.arrivee}, ${x.precision}, train ${x.tgv.train}`;
    return `<a class="billet ${x.type}" href="${esc(x.lien)}" target="_blank" rel="noopener" aria-label="${esc(quoi)}, 0€, ouvrir dans SNCF Connect"><span class="b-papier">${corps}<span class="b-talon"><b>0€</b><small>OUVRIR${FLECHE}</small></span></span></a>`;
  }

  /* Les payants : une ligne de texte, rien qui ressemble à un bouton. */
  function lignePayants(payants) {
    const items = payants.map((x) => {
      const p = pourcentage(x.tgv);
      const niveau = p === null ? '' : p >= 50 ? 'fort' : p >= 25 ? 'moyen' : 'faible';
      const parti = estParti(x.date, x.depart) ? ' class="barre"' : '';
      return `<span${parti}>${heure(x.depart)}${p === null ? '' : ` <em class="${niveau}">${p} %</em>`}</span>`;
    }).join('<i aria-hidden="true">·</i>');
    return `<p class="payants"><span class="p-titre">Payants</span>${items}</p>`;
  }

  /* « vérifier » : ouvre ce jour sur SNCF Connect, au début de la plage. Les 0€ apparus depuis le relevé y sont visibles. */
  function lienVerifier(c, i, date) {
    if (date > (etat.fin || '') || date < aujourdhui()) return '';
    const h = Math.min(23, Math.max(c.de, i * 24) - i * 24);
    const [de, a] = c.sens === 'aller' ? ['Paris', c.ville] : [c.ville, 'Paris'];
    return `<a class="j-verif" href="${esc(lienSncf(de, a, date, `${String(h).padStart(2, '0')}:00`))}" target="_blank" rel="noopener" aria-label="Vérifier le ${JOURS_NOMS[i]} sur SNCF Connect">vérifier${FLECHE}</a>`;
  }

  function blocJour(c, i, nouveaux) {
    const date = ajouterJours(etat.vendredi, i);
    const tous = trajets(c.sens, c.ville).filter((x) => x.date === date && dans(x, c.de, c.a));
    const zero = tous.filter((x) => x.zero);
    const payants = tous.filter((x) => !x.zero);
    const libres = zero.filter((x) => !estParti(x.date, x.depart));
    const cle = `${c.cle}|${date}`;
    const resume = date > (etat.fin || '') ? '<span class="j-rien">pas encore publié</span>' : libres.length === 0
      ? '<span class="j-rien">aucun 0€</span>'
      : `<span class="j-zero">${libres.length === 1 ? `${heure(libres[0].depart)} à 0€` : `${libres.length} trains à 0€`}</span>`;
    const avecPayants = etat.r.payants && payants.length > 0;
    if (!zero.length && !avecPayants) {
      return `<div class="jour fixe"><div class="j-tete"><span class="j-nom">${JOURS_NOMS[i]} ${jourDuMois(date)}</span><span class="j-resume">${resume}</span>${lienVerifier(c, i, date)}</div></div>`;
    }
    let dedans = zero.map((x) => rangee(x)).join('');
    if (!zero.length) dedans += `<p class="vide">Rien à 0€ dans ta plage. ${lienVerifier(c, i, date)}</p>`;
    if (avecPayants) dedans += lignePayants(payants);
    // l'état ouvert ou fermé n'est pas dans le HTML : il est remis après coup, pour qu'ouvrir un jour ne force pas à tout réécrire
    return `<div class="jour${libres.length ? ' a-zero' : ''}" data-cle="${cle}">
<button type="button" class="j-tete" data-action="jour" aria-expanded="false"><span class="j-nom">${JOURS_NOMS[i]} ${jourDuMois(date)}</span><span class="j-resume">${resume}</span>${CHEVRON}</button>
<div class="j-corps"><div class="j-dedans">${dedans}</div></div>
</div>`;
  }

  function section(c, mot, trajet, plage, nouveaux) {
    let html = `<h2 class="s-titre"><span class="mot">${mot}</span><span class="trajet">${esc(trajet)}</span><span class="plage">${esc(plage)}</span></h2>`;
    for (let i = 0; i < 4; i++) {
      if (c.a <= i * 24 || c.de >= (i + 1) * 24) continue;
      html += blocJour(c, i, nouveaux);
    }
    return html;
  }

  function majCorps() {
    const r = etat.r;
    const nouveaux = new Set((etat.donnees.changements || []).filter((x) => x.zero && x.avant === false).map(cleTrain));
    const cs = cotes();
    const plage = (de, a) => `${libelleHeure(de)} → ${libelleHeure(a)}`;
    const parts = r.mode === 'ar'
      ? [['sec-a', section(cs[0], 'Aller', `Paris → ${court(r.aller)}`, plage(r.ad, r.aa), nouveaux)],
        ['sec-r', section(cs[1], 'Retour', `${court(r.retour)} → Paris`, plage(r.rd, r.ra), nouveaux)]]
      : [['sec-a', section(cs[0], 'Trajet', r.sensSimple === 'aller' ? `Paris → ${court(r.aller)}` : `${court(r.aller)} → Paris`, plage(r.ad, r.aa), nouveaux)]];
    const corps = document.getElementById('corps');
    const ids = parts.map(([id]) => id).join(',');
    if (corps.dataset.ids !== ids) {
      corps.innerHTML = `${parts.map(([id]) => `<section class="section" id="${id}"></section>`).join('')}<p class="pied" id="pied"></p>`;
      corps.dataset.ids = ids;
    }
    for (const [id, html] of parts) {
      if (!poser(id, html)) continue;
      const el = document.getElementById(id);
      for (const j of el.querySelectorAll('.jour[data-cle]')) {
        if (etat.ouverts.get(j.dataset.cle) !== true) continue;
        j.classList.add('ouvert');
        j.querySelector('.j-tete').setAttribute('aria-expanded', 'true');
      }
      animerMorceaux(el);
    }
    const avecStats = etat.stats && Object.keys(etat.stats.trains || {}).length;
    const ter = etat.ter && etat.ter.genere ? ` Horaires TER du ${esc(instant(etat.ter.genere))}.` : '';
    const minimum = (etat.stats && etat.stats.minimum) || 4;
    const note = r.payants
      ? (avecStats ? 'Pourcentage : la part des weekends relevés où ce train payant est passé à 0€ avant le départ. ' : `Les pourcentages des payants apparaîtront après ${minimum} weekends relevés. `)
      : '';
    poser('pied', `${note}Open data SNCF du ${esc(instant(etat.donnees.maj_sncf))}, relevée toutes les 30 minutes. Entre deux publications, le lien « vérifier » ouvre le jour sur SNCF Connect.${ter}`);
  }

  /* ---------- Plier et déplier en douceur ---------- */

  let pret = false; // pas d'animation au premier affichage
  const calme = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function plier(el, ouvrir, bascule) {
    const avant = el.getBoundingClientRect().height;
    if (bascule) bascule();
    else el.classList.toggle('ouvert', ouvrir);
    if (el._anim) el._anim.cancel();
    if (el._animDedans) el._animDedans.cancel();
    const apres = ouvrir ? el.scrollHeight : 0;
    if (calme || !pret || avant === apres || !el.animate) return;
    const dedans = el.firstElementChild;
    const courbe = 'cubic-bezier(.32, .72, 0, 1)';
    const duree = ouvrir ? 420 : 320;
    // le contenu est dessiné une fois sur sa propre couche : seule la découpe bouge, rien n'est repeint
    if (dedans) dedans.style.willChange = 'transform, opacity';
    el._anim = el.animate([{ height: `${avant}px` }, { height: `${apres}px` }], { duration: duree, easing: courbe });
    if (dedans) {
      el._animDedans = dedans.animate(
        ouvrir
          ? [{ opacity: 0, transform: 'translateY(-10px)' }, { opacity: 1, transform: 'none' }]
          : [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-6px)' }],
        { duration: ouvrir ? duree : 220, easing: courbe, fill: 'forwards' },
      );
      el._animDedans.onfinish = () => { el._animDedans.cancel(); el._animDedans = null; };
    }
    el._anim.onfinish = () => {
      el._anim = null;
      if (dedans) dedans.style.willChange = '';
    };
  }

  /* ---------- L'horloge de gare ----------
     Petit secret : un appui fait balancer l'horloge sur son crochet et les aiguilles s'emballent. */

  function appuyerHorloge(looping) {
    const el = document.getElementById('horloge');
    if (calme || !el.animate) return;
    const lancer = (id, images, duree, courbe) => {
      const n = document.getElementById(id);
      if (n._a) n._a.cancel();
      n._a = n.animate(images, { duration: duree, easing: courbe });
    };
    const emballe = 'cubic-bezier(.2, .7, .1, 1)';
    // l'horloge se balance sur son crochet ; les aiguilles font des tours entiers et retombent où elles en étaient
    if (looping) lancer('balance', [{ transform: 'rotate(0deg)' }, { transform: 'rotate(-30deg)', offset: 0.2 }, { transform: 'rotate(360deg)' }], 1500, 'cubic-bezier(.45, 0, .2, 1)');
    else lancer('balance', [0, 14, -10, 6, -3, 1, 0].map((d) => ({ transform: `rotate(${d}deg)` })), 1600, 'ease-out');
    lancer('tour-h', [{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], 1200, emballe);
    lancer('tour-m', [{ transform: 'rotate(0deg)' }, { transform: 'rotate(1440deg)' }], 1200, emballe);
    lancer('tour-s', [{ transform: 'rotate(0deg)' }, { transform: 'rotate(-1080deg)' }], 1200, emballe);
  }

  /* ---------- Le rendu de la carte réponse ---------- */

  function changerRendu() {
    const r = etat.r;
    r.rendu = RENDUS[(RENDUS.indexOf(r.rendu) + 1) % RENDUS.length];
    sauver();
    const carte = document.querySelector('.resultat');
    const avant = carte.offsetHeight;
    majPlan(evaluer());
    animerHauteur(carte, avant);
    tourner(document.getElementById('rendu'), [{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], 600, DOUX);
  }

  /* ---------- Petits secrets ----------
     - le logo touché cinq fois de suite : un train traverse le bandeau ;
     - l'horloge touchée trois fois vite : elle fait un tour complet sur son crochet ;
     - un appui long sur « Ton weekend » : il souhaite bon weekend ;
     - la rose des vents de la carte ancienne : elle s'affole ;
     - les plaques émaillées : elles se balancent sur leurs crochets. */

  const rafales = {};
  function rafale(cle, n, fenetre) {
    const t = performance.now();
    const l = (rafales[cle] || []).filter((x) => t - x < fenetre);
    l.push(t);
    rafales[cle] = l;
    if (l.length < n) return false;
    rafales[cle] = [];
    return true;
  }

  function tourner(el, images, duree, courbe) {
    if (!el || calme || !el.animate) return;
    if (el._a) el._a.cancel();
    el._a = el.animate(images, { duration: duree, easing: courbe });
  }

  function secouerLogo() {
    tourner(document.querySelector('.logo'), [-6, -16, 4, -10, -6].map((d) => ({ transform: `rotate(${d}deg)` })), 500, 'ease-out');
  }

  function trainQuiPasse() {
    const tete = document.getElementById('tete');
    if (calme || tete.querySelector('.passage')) return;
    const p = document.createElement('div');
    p.className = 'passage';
    p.setAttribute('aria-hidden', 'true');
    p.innerHTML = `<svg viewBox="0 0 120 22" width="120" height="22">${[0, 1, 2, 3].map((k) => `<rect x="${k * 29}" y="3" width="27" height="13" rx="3" fill="${k === 3 ? '#C8662F' : '#F4F1E9'}" stroke="#1A302C" stroke-width="1"/><rect x="${k * 29 + 5}" y="6" width="6" height="4" fill="#24403B"/><rect x="${k * 29 + 15}" y="6" width="6" height="4" fill="#24403B"/><circle cx="${k * 29 + 7}" cy="18" r="2.4" fill="#F4F1E9"/><circle cx="${k * 29 + 20}" cy="18" r="2.4" fill="#F4F1E9"/>`).join('')}</svg>`;
    tete.appendChild(p);
    p.addEventListener('animationend', () => p.remove());
  }

  function appuiLong() {
    const h1 = document.querySelector('.titre h1');
    let minuteur = 0;
    const annuler = () => clearTimeout(minuteur);
    h1.addEventListener('pointerdown', () => {
      annuler();
      minuteur = setTimeout(() => {
        vibrer();
        h1.textContent = 'Bon weekend !';
        tourner(h1, [{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }, { transform: 'scale(1)' }], 500, DOUX);
        setTimeout(() => { h1.textContent = 'Ton weekend'; }, 2600);
      }, 650);
    });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) h1.addEventListener(ev, annuler);
  }

  /* ---------- Données fraîches : quand l'appli revient au premier plan, on relit le dernier relevé ---------- */

  async function rafraichir() {
    if (document.hidden || Date.now() - etat.charge < 5 * 60000) return;
    etat.charge = Date.now();
    try {
      const d = await charger('data/latest.json');
      if (d.releve === etat.donnees.releve && d.maj_sncf === etat.donnees.maj_sncf) return;
      etat.donnees = d;
      etat.cache.clear();
      const dates = d.trains.map((t) => t.date).sort();
      etat.fin = dates[dates.length - 1];
      majResultats();
    } catch (e) {
      /* hors ligne : on garde ce qu'on a */
    }
  }

  /* ---------- Mes anticipations (gardées sur le téléphone seulement) ----------
     Une anticipation SNCF Connect : un trajet, un jour, une plage horaire. Si un billet MAX se libère
     dans la plage, SNCF Connect le réserve tout seul. Ici on note chaque demande et son issue. */

  const CLE_ANTIC = 'weekendrail:anticipations:v1';
  const GARES_ANTIC = ['Paris', ...VILLES];
  const antic = { liste: chargerAntic(), formulaire: null, valider: null };

  function chargerAntic() {
    try {
      const l = JSON.parse(localStorage.getItem(CLE_ANTIC) || '[]');
      return Array.isArray(l) ? l.filter((a) => a && a.id && a.date) : [];
    } catch (e) {
      return [];
    }
  }
  function sauverAntic() {
    try {
      localStorage.setItem(CLE_ANTIC, JSON.stringify(antic.liste));
    } catch (e) {
      /* stockage indisponible */
    }
  }

  const dateLongue = (iso) => `${['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'][versDate(iso).getUTCDay()]} ${jourDuMois(iso)} ${MOIS_COURT[moisDe(iso)]}`;
  const hhmm = (v) => (v ? heure(v) : '');

  function etatAntic(a) {
    if (a.issue === 'obtenue') return 'obtenue';
    if (a.issue === 'ratee') return 'ratee';
    return a.date < aujourdhui() ? 'a-confirmer' : 'attente';
  }

  function carteAntic(a) {
    const e = etatAntic(a);
    const statut = {
      attente: '<span class="pa-statut attente">en attente</span>',
      'a-confirmer': '<span class="pa-statut confirmer">à confirmer</span>',
      obtenue: '<span class="pa-statut obtenue">obtenue · 0€</span>',
      ratee: '<span class="pa-statut ratee">pas obtenue</span>',
    }[e];
    const detail = e === 'obtenue'
      ? `train de ${hhmm(a.train)}${a.obtenueLe ? ` · obtenu le ${dateLongue(a.obtenueLe)}` : ''}`
      : `demandée le ${dateLongue(a.creeLe)}`;
    const actions = (e === 'attente' || e === 'a-confirmer')
      ? (antic.valider === a.id
        ? `<form class="pa-valider" data-id="${a.id}"><label>Heure du train <input type="time" name="train" required value="${a.de}"></label><button type="submit" class="pa-bouton plein">Valider</button><button type="button" class="pa-bouton" data-action="antic-annuler-valider">Annuler</button></form>`
        : `<div class="pa-actions"><button type="button" class="pa-bouton plein" data-action="antic-obtenue" data-id="${a.id}">Obtenue</button><button type="button" class="pa-bouton" data-action="antic-ratee" data-id="${a.id}">Pas obtenue</button><button type="button" class="pa-lien" data-action="antic-suppr" data-id="${a.id}">Supprimer</button></div>`)
      : `<div class="pa-actions"><button type="button" class="pa-lien" data-action="antic-rouvrir" data-id="${a.id}">Modifier l’issue</button><button type="button" class="pa-lien" data-action="antic-suppr" data-id="${a.id}">Supprimer</button></div>`;
    return `<article class="pa-carte ${e}">
<div class="pa-ligne"><span class="pa-trajet">${esc(court(a.depuis))} → ${esc(court(a.vers))}</span>${statut}</div>
<div class="pa-quand">${dateLongue(a.date)} · ${hhmm(a.de)} → ${hhmm(a.a)}</div>
<div class="pa-detail">${detail}</div>
${actions}
</article>`;
  }

  function options(liste, choisi) {
    return liste.map((g) => `<option value="${esc(g)}"${g === choisi ? ' selected' : ''}>${esc(court(g))}</option>`).join('');
  }

  function formulaireAntic(f) {
    return `<form class="pa-form" id="pa-form">
<div class="pa-champs">
<label>De<select name="depuis">${options(GARES_ANTIC, f.depuis)}</select></label>
<label>Vers<select name="vers">${options(GARES_ANTIC, f.vers)}</select></label>
<label class="large">Jour du train<input type="date" name="date" required value="${f.date}"></label>
<label>Départ après<input type="time" name="de" required value="${f.de}"></label>
<label>et avant<input type="time" name="a" required value="${f.a}"></label>
</div>
<div class="pa-actions"><button type="submit" class="pa-bouton plein">Enregistrer</button><button type="button" class="pa-bouton" data-action="antic-fermer-form">Annuler</button></div>
</form>`;
  }

  function majAntic() {
    const l = antic.liste;
    const finies = l.filter((a) => a.issue);
    const obtenues = l.filter((a) => a.issue === 'obtenue');
    const enCours = l.filter((a) => !a.issue).sort((x, y) => (x.date + x.de).localeCompare(y.date + y.de));
    const passees = finies.sort((x, y) => y.date.localeCompare(x.date));
    const taux = finies.length ? Math.round((100 * obtenues.length) / finies.length) : null;
    const bilan = `<div class="pa-bilan"><div><b>${obtenues.length}</b><span>obtenue${obtenues.length > 1 ? 's' : ''}</span></div><div><b>${finies.length - obtenues.length}</b><span>pas obtenue${finies.length - obtenues.length > 1 ? 's' : ''}</span></div><div><b>${taux === null ? '·' : `${taux} %`}</b><span>de réussite</span></div></div>`;
    const nouvelle = antic.formulaire
      ? formulaireAntic(antic.formulaire)
      : '<button type="button" class="pa-nouvelle" data-action="antic-nouvelle">+ Nouvelle anticipation</button>';
    const aide = l.length ? '' : '<p class="pa-aide">Quand SNCF Connect ne trouve rien à 0€, il propose une anticipation : il réserve tout seul si un billet MAX se libère sur ta plage. Note ici chaque demande, puis son issue, pour garder l’historique.</p>';
    document.getElementById('pa-corps').innerHTML = `${bilan}${nouvelle}${aide}
${enCours.length ? `<h3 class="pa-titre">En cours</h3>${enCours.map(carteAntic).join('')}` : ''}
${passees.length ? `<h3 class="pa-titre">Historique</h3>${passees.map(carteAntic).join('')}` : ''}
<div class="pa-sauvegarde"><p>Tes anticipations restent sur ce téléphone. Pour ne pas les perdre :</p><div class="pa-actions"><button type="button" class="pa-bouton" data-action="antic-exporter">Exporter</button><label class="pa-bouton">Importer<input type="file" accept="application/json" id="pa-import" hidden></label></div></div>`;
    const enAttente = l.filter((a) => !a.issue).length;
    document.getElementById('compte-antic').textContent = enAttente ? String(enAttente) : '';
  }

  function ouvrirAntic(prerempli) {
    if (prerempli) antic.formulaire = prerempli;
    majAntic();
    const page = document.getElementById('page-antic');
    if (location.hash !== '#anticipations') history.pushState(null, '', '#anticipations');
    if (!page.hidden && page.classList.contains('ouverte')) return;
    page.hidden = false;
    page.scrollTop = 0;
    requestAnimationFrame(() => requestAnimationFrame(() => page.classList.add('ouverte')));
    document.body.classList.add('page-ouverte');
  }
  /* Le retour du téléphone (geste ou bouton) ferme aussi la page. */
  function fermerAntic() {
    if (location.hash === '#anticipations') history.back();
    else cacherAntic();
  }
  function cacherAntic() {
    const page = document.getElementById('page-antic');
    page.classList.remove('ouverte');
    document.body.classList.remove('page-ouverte');
    setTimeout(() => { page.hidden = true; }, 320);
  }

  /* Préremplit le formulaire avec la recherche en cours (premier jour de la plage aller). */
  function depuisRecherche() {
    const r = etat.r;
    const aller = r.mode === 'ar' || r.sensSimple === 'aller';
    const jour = Math.min(3, Math.floor(r.ad / 24));
    const deb = Math.max(r.ad, jour * 24) - jour * 24;
    const fin = Math.min(r.aa, (jour + 1) * 24) - jour * 24;
    const h = (x) => `${String(Math.min(x, 23)).padStart(2, '0')}:${x >= 24 ? '59' : '00'}`;
    return {
      depuis: aller ? 'Paris' : r.aller,
      vers: aller ? r.aller : 'Paris',
      date: ajouterJours(etat.vendredi, jour),
      de: h(deb),
      a: h(fin),
    };
  }

  function surActionAntic(action, b) {
    const trouver = (id) => antic.liste.find((a) => a.id === id);
    if (action === 'ouvrir-antic') ouvrirAntic();
    else if (action === 'fermer-antic') fermerAntic();
    else if (action === 'antic-depuis-recherche') ouvrirAntic(depuisRecherche());
    else if (action === 'antic-nouvelle') { antic.formulaire = depuisRecherche(); majAntic(); }
    else if (action === 'antic-fermer-form') { antic.formulaire = null; majAntic(); }
    else if (action === 'antic-obtenue') { antic.valider = b.dataset.id; majAntic(); }
    else if (action === 'antic-annuler-valider') { antic.valider = null; majAntic(); }
    else if (action === 'antic-ratee') { trouver(b.dataset.id).issue = 'ratee'; sauverAntic(); majAntic(); }
    else if (action === 'antic-rouvrir') { const a = trouver(b.dataset.id); delete a.issue; delete a.train; delete a.obtenueLe; sauverAntic(); majAntic(); }
    else if (action === 'antic-suppr') { antic.liste = antic.liste.filter((a) => a.id !== b.dataset.id); sauverAntic(); majAntic(); }
    else if (action === 'antic-exporter') {
      const blob = new Blob([JSON.stringify(antic.liste, null, 2)], { type: 'application/json' });
      const lien = document.createElement('a');
      lien.href = URL.createObjectURL(blob);
      lien.download = `anticipations-${aujourdhui()}.json`;
      lien.click();
      setTimeout(() => URL.revokeObjectURL(lien.href), 1000);
    } else return false;
    return true;
  }

  function surEnvoiAntic(e) {
    const form = e.target;
    if (form.id === 'pa-form') {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(form));
      if (d.depuis === d.vers || d.a <= d.de) {
        form.querySelector(d.depuis === d.vers ? '[name=vers]' : '[name=a]').setCustomValidity(d.depuis === d.vers ? 'Choisis deux gares différentes' : 'L’heure de fin doit être après le début');
        form.reportValidity();
        form.querySelectorAll('select, input').forEach((x) => x.setCustomValidity(''));
        return;
      }
      antic.liste.push({ id: `a${Date.now().toString(36)}`, depuis: d.depuis, vers: d.vers, date: d.date, de: d.de, a: d.a, creeLe: aujourdhui() });
      antic.formulaire = null;
      sauverAntic();
      majAntic();
      vibrer();
    } else if (form.classList.contains('pa-valider')) {
      e.preventDefault();
      const a = antic.liste.find((x) => x.id === form.dataset.id);
      a.issue = 'obtenue';
      a.train = new FormData(form).get('train');
      a.obtenueLe = aujourdhui();
      antic.valider = null;
      sauverAntic();
      majAntic();
      vibrer();
    }
  }

  function surImportAntic(e) {
    const fichier = e.target.files && e.target.files[0];
    if (!fichier) return;
    fichier.text().then((texte) => {
      const l = JSON.parse(texte);
      if (!Array.isArray(l)) return;
      const ids = new Set(antic.liste.map((a) => a.id));
      for (const a of l) if (a && a.id && a.date && !ids.has(a.id)) antic.liste.push(a);
      sauverAntic();
      majAntic();
    }).catch(() => {});
  }

  /* ---------- Interactions ---------- */

  function changer(fn, reglages = true, cote = null) {
    fn();
    oublier(cote);
    sauver();
    if (reglages) majReglages();
    majResultats();
  }

  /* Les jours ouverts restent ouverts du côté qui n'a pas changé. */
  function oublier(cote) {
    if (!cote) {
      etat.ouverts.clear();
      return;
    }
    for (const k of [...etat.ouverts.keys()]) if (k.startsWith(`${cote}|`)) etat.ouverts.delete(k);
  }

  const LIMITES = {
    ad: (v, r) => Math.max(DEBUT, Math.min(v, r.aa - 1)),
    aa: (v, r) => Math.max(r.ad + 1, Math.min(v, FIN)),
    rd: (v, r) => Math.max(DEBUT, Math.min(v, r.ra - 1)),
    ra: (v, r) => Math.max(r.rd + 1, Math.min(v, FIN)),
  };

  // Pendant le glissement : frise, coches et points des villes seulement. Au lâcher : tout le reste.
  let aBouge = false;
  const touches = new Set();
  let attenteFrise = false;
  let attenteResultats = null;
  function surCurseur(e) {
    const input = e.target.closest('.curseur');
    if (!input) return;
    const cle = input.dataset.cle;
    const r = etat.r;
    const v = LIMITES[cle](Math.round(Number(input.value)), r);
    if (Number(input.value) !== v) input.value = v;
    if (v === r[cle]) return;
    r[cle] = v;
    touches.add(cle[0] === 'r' && r.mode === 'ar' ? 'r' : 'a');
    if (!aBouge) document.querySelector('.frise').classList.add('glisse');
    aBouge = true;
    if (!attenteFrise) {
      attenteFrise = true;
      requestAnimationFrame(() => {
        attenteFrise = false;
        majPlages();
        allumerCoches();
      });
    }
    // le reste attend que le doigt se lève (ou une pause franche)
    clearTimeout(attenteResultats);
    attenteResultats = setTimeout(appliquerPlages, 900);
  }

  function appliquerPlages() {
    clearTimeout(attenteResultats);
    document.querySelector('.frise').classList.remove('glisse');
    sauver();
    if (touches.size === 1) oublier([...touches][0]);
    else oublier();
    touches.clear();
    majResultats();
  }

  function surOption(e) {
    const input = e.target.closest('[data-option]');
    if (!input) return;
    changer(() => { etat.r[input.dataset.option] = input.checked; }, false);
  }

  function surClic(e) {
    const b = e.target.closest('[data-action]');
    if (!b) return;
    const r = etat.r;
    const action = b.dataset.action;
    vibrer();
    if (action.startsWith('antic') || action.endsWith('-antic')) {
      surActionAntic(action, b);
      return;
    }
    if (action === 'horloge') {
      appuyerHorloge(rafale('horloge', 3, 1500));
      return;
    }
    if (action === 'rendu') {
      changerRendu();
      return;
    }
    if (action === 'logo') {
      secouerLogo();
      if (rafale('logo', 5, 2500)) trainQuiPasse();
      return;
    }
    if (action === 'rose') {
      tourner(b, [{ transform: 'rotate(0deg)' }, { transform: 'rotate(720deg)' }], 1500, 'cubic-bezier(.2, .7, .1, 1)');
      return;
    }
    if (action === 'plaque') {
      tourner(b, [0, 9, -7, 4, -2, 0].map((d) => ({ transform: `rotate(${d}deg)` })), 1200, 'ease-out');
      return;
    }
    if (action === 'jour' || action === 'reglages') {
      const bloc = action === 'jour' ? b.closest('.jour') : document.getElementById('reglages');
      const ouvert = !bloc.classList.contains('ouvert');
      const corps = action === 'jour' ? bloc.querySelector('.j-corps') : document.getElementById('pli-reglages');
      plier(corps, ouvert, () => {
        bloc.classList.toggle('ouvert', ouvert);
        if (action === 'reglages') corps.classList.toggle('ouvert', ouvert);
      });
      b.setAttribute('aria-expanded', String(ouvert));
      if (action === 'jour') etat.ouverts.set(bloc.dataset.cle, ouvert);
      return;
    }
    if (action === 'ville') {
      const cle = b.dataset.cote === 'r' ? 'retour' : 'aller';
      if (r[cle] === b.dataset.ville) return;
      changer(() => { r[cle] = b.dataset.ville; }, true, r.mode === 'ar' ? b.dataset.cote : null);
    } else if (action === 'mode') {
      if (r.mode === b.dataset.mode) return;
      changer(() => { r.mode = b.dataset.mode; });
    } else if (action === 'inverser') {
      b.classList.toggle('tourne');
      changer(() => { r.sensSimple = r.sensSimple === 'aller' ? 'retour' : 'aller'; });
    } else if (action === 'semaine') {
      if (etat.vendredi === b.dataset.vendredi) return;
      changer(() => { etat.vendredi = b.dataset.vendredi; }, false);
    }
  }

  async function charger(url) {
    const reponse = await fetch(url, { cache: 'no-store' });
    if (!reponse.ok) throw new Error(String(reponse.status));
    return reponse.json();
  }

  async function demarrer() {
    const app = document.getElementById('app');
    const [trains, ter, stats] = await Promise.allSettled([charger('data/latest.json'), charger('data/ter.json'), charger('data/stats.json')]);
    if (trains.status !== 'fulfilled') {
      app.innerHTML = '<p class="erreur">Impossible de charger les trains pour le moment. Réessaie dans quelques minutes.</p>';
      return;
    }
    etat.donnees = trains.value;
    etat.ter = ter.status === 'fulfilled' ? ter.value : null;
    etat.stats = stats.status === 'fulfilled' ? stats.value : null;
    const liste = weekends();
    const v = vendrediDe(aujourdhui());
    const dates = etat.donnees.trains.map((t) => t.date).sort();
    etat.fin = dates[dates.length - 1];
    etat.vendredi = liste.includes(v) ? v : liste[0];
    construire();
    if ('IntersectionObserver' in window && !calme) {
      observateur = new IntersectionObserver((entrees) => {
        for (const e of entrees) {
          if (!e.isIntersecting) continue;
          e.target.classList.add('vu');
          observateur.unobserve(e.target);
        }
      }, { rootMargin: '0px 0px -8% 0px' });
    }
    majReglages();
    majResultats();
    appuiLong();
    etat.charge = Date.now();
    document.addEventListener('visibilitychange', rafraichir);
    setInterval(rafraichir, 10 * 60000);
    pret = true;
    app.addEventListener('click', surClic);
    app.addEventListener('input', surCurseur);
    const lacher = () => {
      if (aBouge) vibrer();
      aBouge = false;
    };
    app.addEventListener('touchend', lacher);
    app.addEventListener('mouseup', lacher);
    app.addEventListener('change', (e) => {
      if (e.target.closest('.curseur')) appliquerPlages();
      else if (e.target.id === 'pa-import') surImportAntic(e);
      else if (e.target.closest('[data-option]')) surOption(e);
    });
    app.addEventListener('submit', surEnvoiAntic);
    window.addEventListener('popstate', () => {
      if (location.hash === '#anticipations') ouvrirAntic();
      else cacherAntic();
    });
    majAntic();
    if (location.hash === '#anticipations') ouvrirAntic();
  }

  demarrer();
})();
