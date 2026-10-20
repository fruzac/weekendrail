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
  const CARTE_FOND = "<rect x=\"1\" y=\"1\" width=\"320\" height=\"220\" rx=\"6\" fill=\"#FBF6EA\" stroke=\"#B79B5E\" stroke-width=\"1\"/><rect x=\"5\" y=\"5\" width=\"312\" height=\"212\" rx=\"3\" fill=\"none\" stroke=\"#B79B5E\" stroke-width=\".6\"/><path d=\"M5 74 H317 M5 148 H317 M108 5 V217 M214 5 V217\" stroke=\"#B79B5E\" stroke-opacity=\".4\" stroke-width=\".6\" stroke-dasharray=\"1 3\" fill=\"none\"/><path d=\"M239.5 120.1 C239.8 122.2 239.8 124.3 239.7 126.2 C239.6 128.2 239.4 130.2 238.8 131.7 C238.2 133.3 237.3 134.6 236.3 135.4 C235.3 136.3 233.9 136.4 232.9 136.7 C231.8 136.9 230.8 136.7 230.0 137.1 C229.2 137.6 228.7 138.5 227.8 139.4 C227.0 140.3 226.2 142.0 225.1 142.7 C224.0 143.4 222.6 144.0 221.3 143.7 C220.1 143.4 218.7 142.2 217.6 141.0 C216.5 139.8 215.5 138.0 214.7 136.3 C213.8 134.6 213.0 132.8 212.3 131.0 C211.7 129.1 211.1 127.1 210.9 125.2 C210.7 123.2 210.9 121.2 211.2 119.4 C211.5 117.7 212.2 116.2 212.8 114.8 C213.3 113.4 213.9 112.3 214.4 110.9 C214.9 109.6 215.2 108.0 215.8 106.7 C216.4 105.5 217.2 104.0 218.1 103.4 C219.0 102.7 220.3 102.7 221.4 102.9 C222.5 103.0 223.7 104.0 224.7 104.5 C225.8 105.0 226.7 105.6 227.8 105.9 C228.9 106.3 230.1 106.2 231.3 106.7 C232.5 107.2 234.1 107.8 235.2 109.0 C236.3 110.2 237.4 112.1 238.2 114.0 C238.9 115.8 239.2 118.1 239.5 120.1Z M236.3 120.7 C236.3 122.3 236.2 123.9 236.0 125.3 C235.8 126.8 235.5 128.2 235.0 129.3 C234.6 130.4 233.9 131.3 233.2 132.0 C232.5 132.7 231.6 132.9 230.9 133.2 C230.2 133.6 229.5 133.7 228.9 134.2 C228.3 134.7 228.0 135.6 227.3 136.4 C226.7 137.1 225.9 138.4 225.1 138.8 C224.2 139.2 223.1 139.4 222.1 139.0 C221.2 138.6 220.2 137.5 219.4 136.4 C218.6 135.4 218.0 133.9 217.4 132.6 C216.8 131.4 216.2 130.1 215.7 128.8 C215.2 127.4 214.6 126.0 214.3 124.6 C214.1 123.1 214.0 121.5 214.1 120.1 C214.2 118.7 214.7 117.5 215.1 116.3 C215.4 115.1 215.9 114.2 216.4 113.2 C216.8 112.2 217.2 111.1 217.8 110.3 C218.4 109.4 219.1 108.6 219.8 108.3 C220.6 108.0 221.5 108.1 222.4 108.3 C223.2 108.5 224.0 109.2 224.8 109.5 C225.5 109.8 226.2 109.9 227.1 110.0 C227.9 110.1 228.9 109.8 229.9 110.1 C231.0 110.4 232.3 110.8 233.2 111.7 C234.1 112.7 235.0 114.2 235.5 115.7 C236.0 117.2 236.2 119.1 236.3 120.7Z M232.7 121.3 C232.6 122.4 232.4 123.5 232.3 124.5 C232.1 125.4 231.9 126.3 231.6 127.1 C231.3 127.8 231.0 128.5 230.6 129.1 C230.2 129.6 229.6 129.9 229.2 130.2 C228.7 130.6 228.3 130.8 227.9 131.2 C227.5 131.7 227.2 132.3 226.7 132.8 C226.2 133.3 225.6 134.0 225.0 134.1 C224.4 134.3 223.6 134.2 223.0 133.8 C222.4 133.5 221.8 132.6 221.3 131.8 C220.7 131.1 220.4 130.1 219.9 129.3 C219.5 128.5 219.0 127.7 218.6 126.9 C218.2 126.0 217.6 125.0 217.4 124.0 C217.1 123.0 216.9 121.8 217.0 120.8 C217.1 119.8 217.4 118.8 217.7 118.0 C218.0 117.2 218.5 116.6 218.8 115.9 C219.2 115.3 219.6 114.7 220.1 114.2 C220.5 113.8 221.0 113.3 221.5 113.2 C222.1 113.0 222.7 113.1 223.2 113.2 C223.8 113.3 224.3 113.6 224.8 113.7 C225.3 113.8 225.8 113.7 226.4 113.6 C227.1 113.6 227.8 113.3 228.6 113.5 C229.3 113.6 230.3 114.0 230.9 114.7 C231.6 115.4 232.1 116.7 232.4 117.8 C232.7 118.9 232.7 120.2 232.7 121.3Z M229.1 122.0 C229.1 122.6 228.9 123.1 228.9 123.6 C228.8 124.2 228.7 124.7 228.6 125.1 C228.5 125.6 228.4 126.0 228.2 126.4 C228.0 126.7 227.7 127.0 227.5 127.2 C227.2 127.5 227.0 127.6 226.7 127.8 C226.5 128.0 226.2 128.3 225.9 128.5 C225.6 128.7 225.3 129.0 225.0 129.0 C224.6 129.1 224.2 129.0 223.9 128.7 C223.5 128.5 223.2 128.0 222.9 127.6 C222.7 127.2 222.4 126.8 222.2 126.3 C221.9 125.9 221.6 125.6 221.3 125.1 C221.0 124.6 220.6 124.1 220.5 123.5 C220.3 122.9 220.2 122.2 220.2 121.6 C220.3 121.0 220.5 120.4 220.7 120.0 C221.0 119.6 221.3 119.2 221.5 118.9 C221.8 118.6 222.1 118.4 222.3 118.2 C222.6 117.9 222.8 117.7 223.1 117.6 C223.4 117.5 223.7 117.5 224.0 117.5 C224.3 117.5 224.5 117.5 224.8 117.5 C225.2 117.5 225.4 117.3 225.8 117.3 C226.2 117.2 226.7 117.1 227.1 117.2 C227.5 117.4 228.0 117.6 228.4 118.1 C228.7 118.6 229.0 119.3 229.1 119.9 C229.2 120.6 229.1 121.3 229.1 122.0Z M223.3 122.7 h3.2 M224.9 121.1 v3.2 M208.2 182.3 C207.9 184.7 206.8 187.0 206.0 189.2 C205.2 191.4 204.4 193.3 203.5 195.5 C202.7 197.6 202.1 200.1 201.0 202.2 C200.0 204.3 198.8 206.8 197.3 208.0 C195.9 209.3 193.9 209.9 192.3 209.8 C190.7 209.7 189.1 208.3 187.7 207.3 C186.3 206.2 185.2 204.7 184.1 203.5 C183.0 202.3 181.9 201.4 180.9 200.2 C180.0 198.9 179.0 197.7 178.2 196.3 C177.4 194.8 176.9 193.0 176.3 191.2 C175.7 189.5 175.3 187.7 174.6 185.7 C174.0 183.7 173.0 181.7 172.4 179.2 C171.8 176.7 171.0 173.5 171.1 170.6 C171.2 167.8 171.9 164.4 173.0 162.2 C174.2 160.0 176.3 158.3 178.0 157.4 C179.8 156.4 181.8 156.6 183.5 156.5 C185.2 156.4 186.6 156.6 188.1 156.6 C189.5 156.6 190.8 156.3 192.1 156.5 C193.4 156.7 194.8 157.1 196.0 157.8 C197.1 158.5 198.2 159.8 199.2 160.9 C200.3 162.0 201.2 163.2 202.3 164.5 C203.4 165.8 204.7 167.0 205.7 168.7 C206.7 170.4 207.8 172.5 208.2 174.8 C208.7 177.0 208.6 179.9 208.2 182.3Z M204.2 181.9 C204.0 183.8 203.3 185.7 202.9 187.6 C202.4 189.4 201.9 191.1 201.3 193.0 C200.7 195.0 200.3 197.2 199.4 199.0 C198.6 200.8 197.4 202.9 196.2 203.8 C194.9 204.7 193.2 204.9 191.9 204.6 C190.6 204.2 189.2 202.7 188.2 201.6 C187.1 200.5 186.3 199.1 185.5 198.1 C184.6 197.1 183.9 196.5 183.0 195.6 C182.2 194.8 181.3 194.2 180.6 193.2 C179.8 192.1 179.1 190.9 178.5 189.5 C177.9 188.2 177.3 186.7 176.8 185.0 C176.2 183.3 175.5 181.5 175.1 179.4 C174.7 177.3 174.3 174.7 174.5 172.5 C174.8 170.2 175.5 167.7 176.6 166.0 C177.6 164.4 179.3 163.3 180.7 162.6 C182.1 162.0 183.7 162.2 185.0 162.0 C186.3 161.7 187.3 161.7 188.5 161.4 C189.6 161.2 190.7 160.5 191.8 160.5 C192.9 160.4 194.1 160.5 195.1 161.0 C196.1 161.6 197.0 162.7 197.9 163.8 C198.7 164.9 199.4 166.2 200.1 167.4 C200.8 168.6 201.7 169.8 202.3 171.2 C203.0 172.7 203.8 174.3 204.1 176.1 C204.4 177.9 204.4 180.0 204.2 181.9Z M200.7 181.6 C200.7 183.1 200.4 184.6 200.1 186.1 C199.9 187.6 199.5 189.1 199.1 190.7 C198.7 192.2 198.3 194.0 197.5 195.4 C196.8 196.7 195.8 198.1 194.8 198.7 C193.8 199.2 192.5 199.1 191.4 198.6 C190.4 198.1 189.5 196.8 188.7 195.9 C187.9 195.0 187.4 193.9 186.7 193.3 C186.1 192.6 185.5 192.4 184.8 191.9 C184.1 191.5 183.2 191.2 182.5 190.5 C181.8 189.9 181.2 188.9 180.7 187.9 C180.1 186.8 179.7 185.5 179.3 184.2 C179.0 182.8 178.6 181.3 178.4 179.7 C178.2 178.1 178.1 176.1 178.4 174.5 C178.7 172.9 179.3 171.1 180.1 169.9 C180.9 168.8 182.2 168.0 183.2 167.5 C184.2 166.9 185.3 166.9 186.2 166.6 C187.1 166.2 187.9 165.8 188.8 165.5 C189.7 165.1 190.5 164.4 191.4 164.3 C192.3 164.2 193.3 164.3 194.1 164.8 C194.9 165.4 195.6 166.5 196.1 167.5 C196.7 168.5 197.1 169.7 197.5 170.8 C198.0 171.8 198.5 172.7 199.0 173.8 C199.4 174.9 200.0 176.0 200.3 177.3 C200.6 178.6 200.7 180.2 200.7 181.6Z M197.6 181.4 C197.7 182.4 197.6 183.5 197.4 184.6 C197.2 185.7 197.0 186.9 196.6 188.0 C196.3 189.0 195.9 190.3 195.3 191.1 C194.8 191.9 194.0 192.7 193.3 193.0 C192.6 193.2 191.6 193.0 191.0 192.6 C190.3 192.2 189.7 191.2 189.1 190.7 C188.6 190.1 188.3 189.5 187.8 189.2 C187.3 188.9 186.8 189.0 186.3 188.7 C185.7 188.5 185.0 188.4 184.5 188.0 C184.0 187.5 183.5 186.8 183.1 186.0 C182.8 185.2 182.6 184.2 182.4 183.2 C182.2 182.2 182.1 181.1 182.1 180.0 C182.0 178.9 182.0 177.7 182.3 176.6 C182.5 175.5 182.9 174.3 183.4 173.5 C183.9 172.7 184.7 172.1 185.3 171.6 C186.0 171.2 186.7 171.0 187.3 170.6 C187.9 170.3 188.5 169.8 189.1 169.5 C189.7 169.2 190.4 168.7 191.1 168.7 C191.7 168.7 192.4 168.9 192.9 169.4 C193.5 169.9 193.9 170.9 194.2 171.7 C194.5 172.5 194.7 173.4 194.9 174.2 C195.2 174.9 195.5 175.5 195.9 176.2 C196.2 176.9 196.7 177.5 197.0 178.4 C197.3 179.3 197.6 180.3 197.6 181.4Z M194.5 181.1 C194.6 181.7 194.5 182.4 194.4 183.0 C194.3 183.7 194.1 184.3 193.8 184.9 C193.6 185.5 193.3 186.1 193.0 186.5 C192.6 186.9 192.2 187.3 191.8 187.4 C191.4 187.5 190.9 187.3 190.5 187.1 C190.1 186.9 189.8 186.4 189.5 186.2 C189.2 185.9 189.0 185.7 188.7 185.6 C188.4 185.5 188.1 185.6 187.8 185.5 C187.4 185.4 187.0 185.3 186.7 185.0 C186.4 184.7 186.2 184.2 186.0 183.8 C185.9 183.3 185.8 182.6 185.8 182.1 C185.7 181.5 185.7 180.9 185.7 180.3 C185.7 179.7 185.7 179.1 185.8 178.5 C185.9 177.9 186.1 177.2 186.4 176.7 C186.6 176.2 187.0 175.8 187.3 175.5 C187.7 175.2 188.0 175.0 188.4 174.7 C188.8 174.5 189.1 174.2 189.5 174.0 C189.8 173.9 190.2 173.7 190.6 173.7 C191.0 173.8 191.4 174.1 191.6 174.4 C191.9 174.8 192.1 175.4 192.2 175.9 C192.4 176.4 192.5 176.9 192.6 177.2 C192.8 177.6 193.0 177.9 193.2 178.2 C193.5 178.6 193.8 178.9 194.0 179.4 C194.2 179.9 194.4 180.5 194.5 181.1Z M188.4 180.7 h3.2 M190.0 179.1 v3.2 M261.5 154.4 C260.8 156.7 259.9 159.4 258.9 161.6 C257.9 163.7 256.5 165.7 255.3 167.4 C254.1 169.1 252.9 170.3 251.7 171.7 C250.5 173.0 249.4 174.5 248.1 175.7 C246.9 176.8 245.5 178.4 244.4 178.8 C243.4 179.3 242.2 179.2 241.6 178.3 C241.0 177.3 240.8 175.2 240.8 173.3 C240.7 171.5 241.1 169.1 241.2 167.4 C241.3 165.7 241.3 164.5 241.1 163.1 C241.0 161.8 240.6 160.8 240.5 159.3 C240.4 157.8 240.3 156.0 240.5 154.0 C240.7 152.0 241.2 149.6 241.8 147.2 C242.5 144.9 243.3 142.4 244.2 139.8 C245.1 137.3 246.2 134.4 247.4 132.1 C248.6 129.8 250.1 127.3 251.5 126.0 C252.8 124.7 254.2 124.2 255.3 124.4 C256.3 124.6 257.0 126.1 257.7 127.0 C258.3 127.9 258.6 129.2 259.2 129.9 C259.8 130.5 260.5 130.5 261.2 130.9 C261.9 131.2 262.8 131.3 263.3 132.1 C263.8 132.9 264.2 134.3 264.3 135.8 C264.4 137.4 264.1 139.5 263.9 141.4 C263.7 143.4 263.3 145.4 262.9 147.6 C262.5 149.7 262.2 152.1 261.5 154.4Z M259.3 153.6 C258.8 155.4 258.2 157.5 257.4 159.4 C256.7 161.2 255.6 163.0 254.7 164.6 C253.7 166.1 252.7 167.3 251.7 168.6 C250.7 169.8 249.7 171.0 248.7 171.9 C247.7 172.8 246.5 173.8 245.7 174.0 C244.8 174.1 244.1 173.6 243.6 172.6 C243.2 171.7 243.3 169.7 243.3 168.1 C243.3 166.6 243.7 164.7 243.7 163.4 C243.7 162.2 243.6 161.5 243.3 160.5 C243.1 159.6 242.6 159.0 242.4 157.8 C242.1 156.7 242.0 155.2 242.1 153.5 C242.3 151.8 242.7 149.7 243.3 147.8 C243.9 145.8 244.6 143.7 245.5 141.7 C246.3 139.8 247.2 137.6 248.2 135.9 C249.3 134.2 250.5 132.4 251.5 131.5 C252.5 130.6 253.6 130.3 254.4 130.4 C255.3 130.4 255.8 131.4 256.4 131.9 C257.0 132.4 257.4 133.1 257.9 133.4 C258.5 133.7 259.2 133.4 259.8 133.7 C260.5 133.9 261.3 134.0 261.6 134.8 C262.0 135.6 262.2 137.0 262.1 138.4 C262.1 139.8 261.7 141.7 261.4 143.4 C261.1 145.0 260.7 146.6 260.3 148.3 C260.0 150.0 259.7 151.7 259.3 153.6Z M257.3 152.9 C257.0 154.3 256.7 156.0 256.1 157.5 C255.6 159.0 254.8 160.6 254.1 161.8 C253.3 163.1 252.5 164.2 251.7 165.1 C250.9 166.0 250.0 166.9 249.3 167.4 C248.5 167.9 247.7 168.4 247.1 168.3 C246.5 168.2 246.0 167.6 245.8 166.8 C245.5 166.0 245.6 164.4 245.6 163.3 C245.6 162.2 245.8 161.0 245.7 160.2 C245.6 159.4 245.4 159.0 245.1 158.4 C244.9 157.8 244.3 157.4 244.1 156.5 C243.9 155.6 243.8 154.3 243.9 153.0 C244.1 151.6 244.6 149.9 245.1 148.4 C245.6 146.9 246.3 145.4 247.0 144.0 C247.6 142.5 248.4 141.1 249.1 139.8 C249.9 138.6 250.8 137.4 251.5 136.7 C252.3 135.9 253.1 135.6 253.7 135.5 C254.4 135.4 254.9 135.8 255.4 136.0 C255.9 136.2 256.3 136.5 256.7 136.7 C257.2 136.8 257.8 136.6 258.3 136.9 C258.8 137.1 259.3 137.4 259.5 138.2 C259.7 139.0 259.7 140.2 259.5 141.4 C259.4 142.6 259.0 144.1 258.7 145.4 C258.4 146.6 258.2 147.8 257.9 149.0 C257.7 150.2 257.6 151.5 257.3 152.9Z M255.6 152.3 C255.5 153.3 255.3 154.6 254.9 155.7 C254.5 156.8 254.0 158.0 253.4 158.9 C252.9 159.7 252.2 160.5 251.7 161.0 C251.1 161.6 250.5 162.0 250.0 162.2 C249.5 162.5 249.0 162.6 248.6 162.5 C248.2 162.3 247.9 161.9 247.8 161.4 C247.6 160.8 247.6 159.9 247.5 159.2 C247.5 158.6 247.6 157.9 247.4 157.5 C247.3 157.0 247.0 156.8 246.8 156.4 C246.6 156.0 246.2 155.7 246.1 155.0 C246.0 154.3 245.9 153.3 246.1 152.4 C246.3 151.4 246.7 150.2 247.1 149.2 C247.5 148.1 248.0 147.2 248.5 146.2 C249.0 145.3 249.5 144.4 250.0 143.5 C250.5 142.7 251.0 141.8 251.5 141.2 C252.1 140.6 252.6 140.2 253.1 140.0 C253.6 139.8 254.0 139.9 254.4 140.0 C254.7 140.1 255.1 140.2 255.4 140.4 C255.7 140.5 256.1 140.5 256.4 140.8 C256.7 141.1 257.0 141.5 257.0 142.1 C257.1 142.8 257.0 143.7 256.9 144.6 C256.7 145.4 256.4 146.4 256.3 147.3 C256.1 148.1 256.0 148.8 255.9 149.6 C255.8 150.4 255.8 151.3 255.6 152.3Z M254.0 151.7 C253.9 152.3 253.8 153.0 253.5 153.7 C253.3 154.3 253.0 155.0 252.7 155.5 C252.3 156.0 252.0 156.3 251.6 156.5 C251.3 156.8 251.0 156.9 250.7 157.0 C250.5 157.1 250.2 157.1 250.0 157.1 C249.8 157.0 249.6 156.8 249.5 156.6 C249.4 156.3 249.4 155.9 249.3 155.6 C249.2 155.3 249.2 155.0 249.1 154.8 C249.0 154.5 248.8 154.4 248.7 154.2 C248.6 153.9 248.4 153.7 248.4 153.3 C248.3 152.8 248.4 152.2 248.5 151.7 C248.7 151.1 248.9 150.5 249.2 149.9 C249.4 149.4 249.7 148.9 249.9 148.3 C250.2 147.8 250.4 147.3 250.7 146.8 C251.0 146.3 251.3 145.7 251.6 145.3 C251.9 144.9 252.2 144.6 252.5 144.4 C252.8 144.3 253.0 144.3 253.2 144.4 C253.5 144.4 253.6 144.6 253.8 144.7 C254.0 144.8 254.2 145.0 254.3 145.2 C254.4 145.4 254.5 145.7 254.5 146.1 C254.6 146.5 254.5 147.0 254.4 147.5 C254.3 148.0 254.2 148.4 254.1 148.9 C254.1 149.3 254.1 149.6 254.0 150.1 C254.0 150.6 254.1 151.1 254.0 151.7Z M250.0 150.8 h3.2 M251.6 149.2 v3.2 M277.7 74.6 C277.8 76.0 277.7 77.7 277.1 78.9 C276.6 80.1 275.4 81.3 274.4 82.1 C273.4 82.9 272.1 83.2 271.1 83.7 C270.1 84.2 269.3 84.6 268.5 85.2 C267.7 85.7 267.0 86.5 266.1 87.0 C265.2 87.5 264.2 88.1 263.2 88.4 C262.2 88.6 261.1 88.7 259.9 88.7 C258.8 88.7 257.6 88.6 256.3 88.4 C255.0 88.1 253.5 87.9 252.3 87.2 C251.1 86.4 249.8 85.3 249.2 83.9 C248.5 82.6 248.4 80.7 248.6 79.1 C248.7 77.6 249.7 75.9 250.3 74.6 C250.9 73.3 251.8 72.3 252.4 71.2 C252.9 70.2 253.2 69.2 253.6 68.2 C254.0 67.2 254.3 66.0 254.9 65.0 C255.5 64.1 256.3 63.2 257.2 62.5 C258.0 61.9 259.1 61.5 260.1 61.1 C261.1 60.6 262.1 60.2 263.2 59.9 C264.3 59.6 265.6 59.2 266.8 59.3 C267.9 59.4 269.3 59.7 270.3 60.4 C271.3 61.1 272.2 62.3 272.9 63.4 C273.6 64.5 274.0 65.8 274.6 67.0 C275.2 68.2 275.8 69.3 276.3 70.5 C276.8 71.8 277.5 73.2 277.7 74.6Z M274.7 74.6 C274.7 75.7 274.4 77.0 273.9 77.9 C273.3 78.8 272.3 79.6 271.4 80.1 C270.6 80.6 269.6 80.8 268.9 81.2 C268.1 81.5 267.6 81.8 267.1 82.3 C266.5 82.8 266.1 83.6 265.4 84.1 C264.8 84.7 264.0 85.3 263.2 85.6 C262.4 85.9 261.5 86.0 260.6 86.0 C259.6 86.0 258.7 85.9 257.7 85.6 C256.8 85.3 255.7 84.9 254.9 84.2 C254.0 83.6 253.2 82.6 252.8 81.5 C252.4 80.5 252.3 79.1 252.5 77.9 C252.6 76.8 253.3 75.6 253.7 74.6 C254.1 73.6 254.6 72.9 254.9 72.0 C255.2 71.2 255.2 70.3 255.5 69.5 C255.8 68.6 256.0 67.6 256.4 66.8 C256.9 66.1 257.7 65.4 258.4 65.0 C259.1 64.5 260.0 64.4 260.8 64.2 C261.6 64.0 262.4 63.9 263.2 63.8 C264.0 63.7 264.9 63.4 265.8 63.5 C266.7 63.5 267.6 63.7 268.5 64.1 C269.3 64.5 270.0 65.3 270.6 66.0 C271.3 66.8 271.8 67.7 272.3 68.5 C272.8 69.4 273.4 70.3 273.8 71.3 C274.2 72.3 274.7 73.5 274.7 74.6Z M271.2 74.6 C271.2 75.4 270.8 76.2 270.4 76.8 C270.0 77.4 269.2 77.9 268.6 78.2 C268.0 78.6 267.4 78.6 267.0 78.9 C266.5 79.2 266.2 79.5 265.9 80.0 C265.5 80.4 265.3 81.1 264.8 81.5 C264.4 82.0 263.8 82.5 263.2 82.7 C262.6 82.9 261.9 83.0 261.3 82.9 C260.6 82.8 260.0 82.6 259.4 82.3 C258.7 82.0 258.1 81.6 257.6 81.1 C257.0 80.6 256.5 79.9 256.3 79.2 C256.0 78.5 256.0 77.6 256.0 76.8 C256.1 76.0 256.4 75.3 256.6 74.6 C256.8 73.9 257.0 73.4 257.2 72.7 C257.3 72.1 257.3 71.4 257.5 70.8 C257.7 70.2 257.9 69.4 258.3 68.9 C258.7 68.4 259.3 68.1 259.8 67.9 C260.4 67.6 261.0 67.7 261.6 67.6 C262.1 67.6 262.6 67.6 263.2 67.5 C263.8 67.4 264.3 67.2 264.9 67.2 C265.5 67.1 266.2 67.1 266.8 67.3 C267.5 67.5 268.1 67.9 268.6 68.4 C269.1 68.9 269.5 69.5 269.9 70.2 C270.2 70.8 270.6 71.5 270.9 72.2 C271.1 73.0 271.3 73.8 271.2 74.6Z M267.6 74.6 C267.5 75.0 267.3 75.5 267.1 75.8 C266.8 76.1 266.4 76.3 266.1 76.5 C265.8 76.7 265.5 76.8 265.3 77.0 C265.1 77.2 265.0 77.5 264.8 77.8 C264.6 78.0 264.4 78.5 264.2 78.7 C263.9 79.0 263.5 79.3 263.2 79.4 C262.9 79.5 262.5 79.4 262.1 79.3 C261.8 79.2 261.4 79.0 261.1 78.8 C260.8 78.6 260.4 78.4 260.2 78.1 C259.9 77.8 259.6 77.5 259.4 77.1 C259.3 76.7 259.2 76.3 259.2 75.8 C259.2 75.4 259.3 75.0 259.3 74.6 C259.4 74.2 259.5 73.9 259.6 73.5 C259.7 73.1 259.7 72.7 259.8 72.4 C260.0 72.0 260.1 71.6 260.4 71.4 C260.7 71.1 261.0 71.0 261.4 70.9 C261.7 70.8 262.0 70.9 262.3 70.9 C262.6 70.9 262.9 70.9 263.2 70.8 C263.5 70.7 263.8 70.5 264.2 70.4 C264.5 70.4 265.0 70.3 265.3 70.4 C265.7 70.4 266.1 70.7 266.4 70.9 C266.7 71.2 266.9 71.6 267.1 72.0 C267.3 72.4 267.5 72.8 267.6 73.3 C267.7 73.7 267.7 74.2 267.6 74.6Z M261.6 74.6 h3.2 M263.2 73.0 v3.2 M215.0 26.7 C214.8 27.8 214.3 29.0 213.5 29.9 C212.7 30.8 211.4 31.5 210.2 32.1 C209.0 32.8 207.6 33.2 206.4 33.7 C205.1 34.2 204.0 34.7 202.7 35.1 C201.3 35.5 199.8 35.9 198.3 36.0 C196.9 36.0 195.2 35.7 193.7 35.3 C192.2 35.0 190.9 34.2 189.4 33.7 C188.0 33.2 186.7 32.8 185.0 32.3 C183.4 31.8 181.3 31.4 179.6 30.6 C177.9 29.9 175.8 28.8 174.7 27.6 C173.7 26.4 173.1 24.8 173.2 23.5 C173.3 22.1 174.4 20.8 175.3 19.7 C176.2 18.6 177.6 17.8 178.8 17.0 C179.9 16.2 181.0 15.5 182.2 14.9 C183.3 14.3 184.5 13.9 185.8 13.5 C187.1 13.2 188.5 13.1 189.8 13.0 C191.1 12.8 192.3 12.7 193.6 12.4 C195.0 12.1 196.3 11.6 197.9 11.2 C199.6 10.9 201.7 10.4 203.6 10.6 C205.5 10.7 207.7 11.2 209.3 12.1 C210.8 12.9 211.9 14.4 212.7 15.6 C213.5 16.9 213.6 18.3 213.9 19.6 C214.2 20.9 214.4 22.0 214.6 23.2 C214.8 24.4 215.1 25.6 215.0 26.7Z M209.7 25.7 C209.7 26.6 209.4 27.5 208.8 28.1 C208.2 28.8 207.2 29.3 206.2 29.7 C205.3 30.1 204.1 30.3 203.2 30.5 C202.2 30.8 201.3 31.0 200.4 31.2 C199.4 31.4 198.5 31.6 197.5 31.6 C196.5 31.6 195.4 31.5 194.4 31.3 C193.4 31.2 192.4 30.8 191.4 30.6 C190.3 30.3 189.2 30.1 188.0 29.8 C186.8 29.5 185.2 29.2 184.0 28.7 C182.7 28.1 181.3 27.3 180.7 26.4 C180.0 25.5 179.9 24.3 180.1 23.4 C180.3 22.5 181.3 21.6 182.0 20.9 C182.8 20.2 183.8 19.7 184.6 19.1 C185.4 18.6 186.0 18.1 186.7 17.7 C187.4 17.3 188.0 16.8 188.8 16.5 C189.6 16.1 190.5 15.9 191.4 15.7 C192.3 15.5 193.2 15.4 194.2 15.2 C195.2 15.0 196.2 14.7 197.3 14.6 C198.5 14.4 200.0 14.2 201.2 14.4 C202.5 14.6 203.9 15.1 204.9 15.7 C205.8 16.4 206.5 17.4 207.0 18.2 C207.5 19.1 207.7 20.0 208.0 20.8 C208.3 21.6 208.7 22.4 208.9 23.2 C209.2 24.0 209.7 24.9 209.7 25.7Z M204.0 24.8 C204.0 25.2 203.8 25.8 203.4 26.1 C203.0 26.5 202.3 26.7 201.7 26.9 C201.1 27.1 200.4 27.1 199.8 27.2 C199.2 27.3 198.7 27.4 198.2 27.5 C197.7 27.6 197.2 27.7 196.7 27.8 C196.2 27.9 195.6 27.9 195.0 27.8 C194.4 27.8 193.8 27.7 193.2 27.6 C192.5 27.5 191.9 27.4 191.1 27.2 C190.4 27.0 189.5 26.8 188.9 26.4 C188.2 26.1 187.5 25.6 187.2 25.1 C187.0 24.5 187.0 23.9 187.2 23.4 C187.4 22.8 188.0 22.4 188.4 22.0 C188.9 21.6 189.4 21.4 189.7 21.0 C190.1 20.7 190.3 20.4 190.7 20.1 C191.0 19.8 191.3 19.5 191.7 19.3 C192.1 19.0 192.6 18.9 193.2 18.7 C193.7 18.6 194.2 18.6 194.8 18.5 C195.4 18.5 196.0 18.4 196.7 18.4 C197.3 18.3 198.1 18.3 198.8 18.5 C199.4 18.6 200.2 18.9 200.7 19.2 C201.2 19.6 201.6 20.1 201.9 20.5 C202.2 21.0 202.4 21.4 202.7 21.9 C202.9 22.3 203.3 22.8 203.5 23.2 C203.7 23.7 204.1 24.3 204.0 24.8Z M194.2 23.3 h3.2 M195.8 21.7 v3.2 M310.6 39.8 C310.7 41.6 310.8 43.6 310.5 45.4 C310.2 47.2 309.6 49.0 308.9 50.4 C308.2 51.9 307.1 53.0 306.1 54.0 C305.1 55.0 304.1 55.7 303.2 56.5 C302.2 57.3 301.2 58.2 300.2 58.7 C299.1 59.1 298.0 59.5 296.9 59.3 C295.8 59.1 294.8 58.1 293.9 57.3 C293.0 56.4 292.3 55.0 291.5 54.1 C290.7 53.2 290.0 52.6 289.1 51.9 C288.1 51.1 286.8 50.8 285.7 49.8 C284.6 48.8 283.2 47.4 282.4 45.8 C281.7 44.1 281.3 41.8 281.3 39.8 C281.3 37.8 281.8 35.6 282.3 33.8 C282.9 32.0 283.7 30.2 284.5 28.8 C285.3 27.3 286.3 26.0 287.3 25.1 C288.4 24.2 289.6 23.6 290.7 23.4 C291.9 23.2 293.1 23.7 294.1 23.9 C295.2 24.1 296.0 24.5 296.9 24.4 C297.8 24.3 298.7 23.7 299.8 23.4 C300.9 23.0 302.2 22.2 303.4 22.4 C304.7 22.5 306.1 23.1 307.0 24.2 C308.0 25.3 308.7 27.2 309.2 28.9 C309.7 30.6 309.8 32.6 310.1 34.4 C310.3 36.2 310.5 38.0 310.6 39.8Z M307.2 39.8 C307.4 41.2 307.6 42.8 307.5 44.2 C307.4 45.6 307.1 47.2 306.5 48.4 C306.0 49.5 305.1 50.5 304.3 51.2 C303.5 52.0 302.6 52.4 301.8 52.9 C301.0 53.4 300.2 53.8 299.4 54.0 C298.6 54.2 297.7 54.3 296.9 54.0 C296.1 53.7 295.4 53.0 294.7 52.5 C294.0 51.9 293.5 51.0 292.9 50.5 C292.2 50.0 291.6 49.7 290.7 49.3 C289.9 48.8 288.7 48.6 287.8 47.8 C286.9 47.1 285.8 45.9 285.3 44.6 C284.8 43.2 284.6 41.4 284.7 39.8 C284.8 38.2 285.4 36.6 285.9 35.3 C286.4 33.9 287.2 32.8 287.8 31.7 C288.5 30.7 289.2 29.7 289.9 29.0 C290.7 28.3 291.5 27.8 292.3 27.5 C293.1 27.2 294.0 27.4 294.7 27.3 C295.5 27.3 296.1 27.4 296.9 27.2 C297.7 27.1 298.4 26.6 299.2 26.4 C300.1 26.2 301.2 25.8 302.0 26.1 C302.9 26.4 303.9 27.1 304.5 28.0 C305.2 29.0 305.6 30.5 305.9 31.8 C306.2 33.1 306.3 34.5 306.5 35.8 C306.7 37.2 307.0 38.4 307.2 39.8Z M304.2 39.8 C304.4 40.8 304.7 41.9 304.6 43.0 C304.6 44.0 304.3 45.2 303.9 46.0 C303.5 46.9 302.8 47.5 302.2 48.0 C301.6 48.4 300.9 48.6 300.3 48.8 C299.7 49.0 299.1 49.1 298.5 49.2 C298.0 49.2 297.4 49.3 296.9 49.1 C296.4 49.0 295.9 48.6 295.4 48.3 C294.9 48.1 294.6 47.7 294.1 47.4 C293.5 47.1 293.0 47.0 292.4 46.8 C291.7 46.5 290.9 46.3 290.3 45.7 C289.6 45.1 288.9 44.2 288.6 43.2 C288.4 42.2 288.3 40.9 288.5 39.8 C288.6 38.7 289.2 37.7 289.6 36.8 C290.0 35.9 290.5 35.2 290.9 34.5 C291.3 33.7 291.7 33.1 292.2 32.5 C292.6 31.9 293.1 31.4 293.6 31.1 C294.2 30.8 294.8 30.7 295.3 30.6 C295.8 30.5 296.4 30.5 296.9 30.5 C297.4 30.4 298.0 30.2 298.6 30.2 C299.2 30.2 299.9 30.1 300.4 30.4 C301.0 30.7 301.6 31.3 302.0 32.0 C302.4 32.7 302.6 33.7 302.9 34.5 C303.1 35.4 303.2 36.2 303.4 37.1 C303.6 38.0 304.0 38.8 304.2 39.8Z M301.2 39.8 C301.3 40.4 301.5 41.1 301.5 41.7 C301.4 42.3 301.2 43.0 301.0 43.4 C300.7 43.9 300.2 44.2 299.9 44.4 C299.5 44.6 299.1 44.6 298.7 44.6 C298.4 44.7 298.1 44.8 297.8 44.8 C297.5 44.8 297.2 44.9 296.9 44.9 C296.6 44.9 296.3 44.8 296.0 44.7 C295.8 44.6 295.5 44.5 295.2 44.3 C294.9 44.2 294.6 44.2 294.2 44.0 C293.8 43.8 293.4 43.6 293.0 43.2 C292.7 42.8 292.4 42.3 292.3 41.7 C292.2 41.1 292.2 40.4 292.3 39.8 C292.4 39.2 292.7 38.7 293.0 38.2 C293.2 37.7 293.4 37.3 293.6 36.9 C293.8 36.5 294.0 36.0 294.2 35.6 C294.4 35.3 294.7 34.9 295.0 34.6 C295.3 34.4 295.6 34.3 295.9 34.3 C296.3 34.2 296.6 34.3 296.9 34.3 C297.2 34.4 297.5 34.4 297.8 34.4 C298.2 34.5 298.5 34.5 298.8 34.7 C299.1 34.9 299.4 35.2 299.6 35.6 C299.9 36.0 300.0 36.5 300.2 36.9 C300.3 37.3 300.5 37.8 300.6 38.3 C300.8 38.7 301.1 39.2 301.2 39.8Z M295.3 39.8 h3.2 M296.9 38.2 v3.2 M231.1 68.5 C230.9 69.6 230.6 70.7 230.3 71.6 C230.0 72.5 229.6 73.2 229.3 73.8 C229.0 74.4 228.7 74.7 228.4 75.4 C228.1 76.0 227.9 76.7 227.5 77.5 C227.2 78.4 226.9 79.8 226.5 80.7 C226.1 81.6 225.5 82.7 225.1 83.1 C224.6 83.5 224.2 83.3 223.8 82.9 C223.5 82.4 223.3 81.3 223.2 80.4 C223.0 79.5 222.9 78.3 222.9 77.3 C222.8 76.2 222.7 75.2 222.8 74.1 C222.8 73.0 222.9 71.8 223.0 70.7 C223.2 69.6 223.4 68.5 223.6 67.5 C223.9 66.5 224.1 65.6 224.3 64.7 C224.5 63.7 224.7 62.8 224.9 61.8 C225.1 60.7 225.4 59.5 225.7 58.6 C226.0 57.7 226.4 56.8 226.8 56.3 C227.1 55.8 227.6 55.8 227.9 55.7 C228.3 55.6 228.6 55.8 228.9 55.8 C229.3 55.8 229.6 55.6 230.0 55.6 C230.4 55.6 230.8 55.4 231.2 55.8 C231.5 56.2 231.8 56.9 232.0 57.8 C232.1 58.8 232.1 60.1 232.0 61.4 C232.0 62.6 231.8 63.9 231.6 65.1 C231.5 66.3 231.3 67.5 231.1 68.5Z M229.3 68.3 C229.1 68.9 229.0 69.4 228.9 69.9 C228.7 70.4 228.5 70.8 228.4 71.2 C228.2 71.6 228.1 71.9 227.9 72.3 C227.7 72.7 227.6 73.2 227.4 73.7 C227.2 74.3 227.0 75.0 226.8 75.5 C226.5 76.0 226.2 76.5 226.0 76.7 C225.7 76.8 225.5 76.6 225.3 76.2 C225.2 75.9 225.1 75.2 225.0 74.7 C224.9 74.1 224.9 73.5 224.9 73.0 C224.8 72.5 224.7 72.0 224.7 71.4 C224.7 70.8 224.7 70.2 224.8 69.6 C224.8 69.0 225.0 68.3 225.1 67.7 C225.2 67.1 225.3 66.6 225.5 66.0 C225.6 65.5 225.7 64.9 225.9 64.4 C226.0 63.9 226.2 63.3 226.4 62.8 C226.5 62.4 226.8 62.0 227.0 61.7 C227.2 61.5 227.4 61.5 227.6 61.4 C227.8 61.3 227.9 61.3 228.2 61.2 C228.4 61.1 228.6 60.9 228.8 60.8 C229.1 60.7 229.4 60.6 229.6 60.8 C229.7 61.0 229.9 61.5 230.0 62.0 C230.1 62.6 230.0 63.5 230.0 64.2 C229.9 64.9 229.8 65.7 229.6 66.4 C229.5 67.1 229.4 67.7 229.3 68.3Z M225.6 68.0 h3.2 M227.2 66.4 v3.2 M300.6 112.6 C300.5 114.2 300.1 115.9 299.6 117.6 C299.0 119.2 298.2 120.8 297.4 122.2 C296.6 123.7 295.6 125.3 294.5 126.5 C293.4 127.6 292.0 128.8 290.8 129.1 C289.6 129.4 288.1 129.1 287.1 128.4 C286.0 127.8 285.2 126.2 284.5 125.0 C283.8 123.9 283.5 122.6 282.9 121.8 C282.3 121.0 281.6 120.7 280.9 120.2 C280.1 119.6 279.0 119.4 278.2 118.6 C277.5 117.8 276.7 116.7 276.4 115.4 C276.0 114.1 276.0 112.5 276.0 110.9 C276.0 109.4 276.2 107.8 276.5 106.1 C276.8 104.5 277.1 102.7 277.7 101.1 C278.3 99.5 279.1 97.8 280.0 96.6 C281.0 95.4 282.3 94.5 283.5 93.9 C284.6 93.3 285.8 93.2 287.0 92.9 C288.1 92.6 289.1 92.4 290.2 92.2 C291.3 92.0 292.4 91.5 293.5 91.6 C294.5 91.7 295.7 92.0 296.5 92.9 C297.2 93.7 297.7 95.2 298.0 96.6 C298.3 97.9 298.2 99.6 298.4 100.9 C298.5 102.2 298.6 103.3 298.9 104.4 C299.2 105.6 299.8 106.7 300.0 108.0 C300.3 109.4 300.6 111.0 300.6 112.6Z M298.2 112.0 C298.2 113.2 297.9 114.7 297.4 116.0 C297.0 117.2 296.3 118.4 295.5 119.5 C294.8 120.6 294.0 121.6 293.1 122.4 C292.2 123.1 291.2 123.8 290.2 123.9 C289.3 124.1 288.3 123.8 287.5 123.3 C286.7 122.8 286.1 121.7 285.6 121.0 C285.0 120.3 284.7 119.6 284.2 119.1 C283.6 118.6 283.0 118.5 282.3 118.2 C281.7 117.8 280.8 117.5 280.2 116.9 C279.6 116.2 279.2 115.2 279.0 114.1 C278.8 113.1 278.9 111.8 279.1 110.6 C279.2 109.4 279.5 108.2 279.8 107.0 C280.0 105.8 280.2 104.6 280.7 103.4 C281.1 102.2 281.6 100.8 282.2 99.8 C282.9 98.8 283.8 98.0 284.6 97.3 C285.5 96.7 286.4 96.5 287.3 96.2 C288.2 95.8 289.0 95.6 289.9 95.5 C290.7 95.3 291.7 95.1 292.5 95.3 C293.2 95.6 294.1 96.1 294.6 96.9 C295.1 97.6 295.3 99.0 295.5 100.0 C295.7 101.1 295.5 102.3 295.6 103.3 C295.8 104.2 295.9 104.9 296.3 105.7 C296.6 106.6 297.2 107.3 297.5 108.3 C297.9 109.4 298.2 110.7 298.2 112.0Z M295.7 111.3 C295.6 112.2 295.3 113.2 295.0 114.1 C294.6 115.0 294.0 115.7 293.4 116.4 C292.9 117.1 292.3 117.6 291.6 118.1 C291.0 118.5 290.3 118.9 289.7 119.0 C289.1 119.2 288.4 119.0 287.9 118.8 C287.4 118.5 286.9 118.0 286.5 117.6 C286.1 117.2 285.8 116.8 285.4 116.5 C284.9 116.2 284.4 116.2 284.0 115.9 C283.5 115.6 282.9 115.3 282.6 114.8 C282.2 114.2 282.0 113.4 282.0 112.7 C281.9 111.9 282.1 111.0 282.3 110.2 C282.4 109.4 282.6 108.6 282.8 107.8 C283.0 107.0 283.0 106.2 283.3 105.3 C283.5 104.5 283.7 103.5 284.1 102.7 C284.6 101.9 285.2 101.2 285.7 100.7 C286.3 100.2 287.0 99.9 287.7 99.7 C288.3 99.5 288.9 99.4 289.6 99.4 C290.2 99.4 290.8 99.4 291.3 99.7 C291.8 100.0 292.3 100.4 292.6 101.0 C292.9 101.6 293.0 102.6 293.2 103.3 C293.3 104.0 293.2 104.7 293.3 105.3 C293.5 105.9 293.7 106.3 294.0 106.8 C294.3 107.4 294.9 107.9 295.2 108.6 C295.4 109.4 295.7 110.4 295.7 111.3Z M292.8 110.5 C292.7 111.0 292.5 111.6 292.2 112.0 C292.0 112.5 291.6 112.9 291.3 113.2 C291.0 113.5 290.6 113.8 290.3 114.1 C289.9 114.3 289.6 114.6 289.3 114.7 C288.9 114.8 288.6 114.8 288.2 114.7 C287.9 114.7 287.7 114.4 287.4 114.2 C287.1 114.1 286.9 113.9 286.7 113.7 C286.4 113.5 286.2 113.4 285.9 113.2 C285.7 113.0 285.4 112.8 285.3 112.4 C285.1 112.1 285.1 111.6 285.1 111.2 C285.1 110.7 285.2 110.3 285.3 109.8 C285.4 109.4 285.4 109.0 285.5 108.5 C285.6 108.1 285.5 107.6 285.6 107.1 C285.7 106.6 285.8 105.9 286.0 105.5 C286.3 105.0 286.6 104.5 286.9 104.2 C287.3 103.9 287.7 103.8 288.1 103.7 C288.5 103.7 288.8 103.7 289.2 103.8 C289.5 103.8 289.8 103.9 290.1 104.1 C290.4 104.3 290.6 104.6 290.8 104.9 C291.0 105.3 291.0 105.7 291.1 106.1 C291.2 106.4 291.2 106.8 291.3 107.1 C291.5 107.4 291.7 107.6 291.9 107.9 C292.1 108.2 292.4 108.5 292.6 108.9 C292.7 109.4 292.8 110.0 292.8 110.5Z M287.1 109.4 h3.2 M288.7 107.8 v3.2\" fill=\"none\" stroke=\"#B79B5E\" stroke-opacity=\".5\" stroke-width=\".65\"/><path d=\"M112.2 8.3 C111.2 11.4 106.6 20.8 106.4 26.6 C106.2 32.4 110.3 37.0 111.0 43.1 C111.7 49.2 110.6 59.7 110.5 63.0\" stroke=\"#9FB3AE\" stroke-width=\"1.3\" fill=\"none\" opacity=\".8\"/><path d=\"M227.2 8.3 C227.4 11.4 229.7 19.4 228.3 26.6 C227.0 33.8 223.6 44.5 219.1 51.4 C214.6 58.3 208.4 67.5 201.6 68.0 C194.8 68.5 186.1 58.0 178.4 54.7 C170.7 51.4 163.9 47.8 155.2 48.1 C146.5 48.4 133.5 53.9 126.1 56.4 C118.7 58.9 113.5 61.9 111.0 63.0\" stroke=\"#9FB3AE\" stroke-width=\"1.3\" fill=\"none\" opacity=\".8\"/><path d=\"M111.0 63.0 C110.6 69.3 108.7 87.8 108.7 101.1 C108.7 114.4 110.0 130.2 111.0 142.6 C112.0 155.0 113.7 163.3 114.5 175.7 C115.3 188.1 115.5 210.2 115.7 217.1\" stroke=\"#9FB3AE\" stroke-width=\"1.3\" fill=\"none\" opacity=\".8\"/><path d=\"M303.8 71.3 C297.4 76.3 275.8 92.0 265.5 101.1 C255.2 110.2 250.0 117.7 242.3 126.0 C234.6 134.3 225.5 148.6 219.1 150.8 C212.7 153.0 209.8 139.2 204.0 139.2 C198.2 139.2 191.4 146.1 184.2 150.8 C177.0 155.5 168.7 163.0 161.0 167.4 C153.3 171.8 145.2 174.1 137.8 177.4 C130.4 180.7 120.3 185.7 116.8 187.3\" stroke=\"#9FB3AE\" stroke-width=\"1.3\" fill=\"none\" opacity=\".8\"/><path d=\"M302.7 43.1 C301.3 47.2 295.9 63.3 294.5 68.0 C293.1 72.7 294.5 70.8 294.5 71.3\" stroke=\"#9FB3AE\" stroke-width=\"1.3\" fill=\"none\" opacity=\".8\"/><path d=\"M231.0 51.1 C230.6 51.1 230.3 52.2 230.1 53.1 C229.9 54.0 229.8 55.3 229.9 56.4 C230.0 57.5 230.1 58.6 230.4 59.7 C230.7 60.8 231.2 61.9 231.5 63.0 C231.8 64.1 231.8 65.2 232.1 66.3 C232.4 67.4 233.0 68.6 233.2 69.7 C233.4 70.8 233.4 72.0 233.3 73.0 C233.2 74.0 232.9 74.8 232.9 75.5 C232.9 76.2 233.3 77.0 233.6 77.1 C233.9 77.2 234.4 77.0 234.8 76.3 C235.2 75.6 235.6 74.1 236.0 73.0 C236.4 71.9 237.3 70.8 237.2 69.7 C237.1 68.6 235.9 67.4 235.5 66.3 C235.1 65.2 235.0 64.1 234.8 63.0 C234.6 61.9 234.5 60.8 234.3 59.7 C234.1 58.6 233.8 57.5 233.6 56.4 C233.3 55.3 233.2 54.0 232.8 53.1 C232.4 52.2 231.4 51.1 231.0 51.1Z\" fill=\"#D6E2DE\" stroke=\"#9FB3AE\" stroke-width=\".9\"/><path d=\"M232.0 55.1 C231.7 55.1 231.6 55.9 231.5 56.5 C231.4 57.2 231.3 58.1 231.4 58.9 C231.4 59.6 231.5 60.4 231.6 61.2 C231.8 61.9 232.1 62.7 232.2 63.5 C232.4 64.2 232.4 65.0 232.6 65.8 C232.7 66.6 233.1 67.4 233.2 68.2 C233.3 68.9 233.3 69.8 233.2 70.5 C233.2 71.1 233.0 71.7 233.0 72.2 C233.0 72.7 233.2 73.2 233.4 73.3 C233.6 73.4 233.8 73.3 234.1 72.8 C234.3 72.3 234.5 71.2 234.7 70.5 C234.9 69.7 235.4 68.9 235.4 68.2 C235.3 67.4 234.7 66.6 234.4 65.8 C234.2 65.0 234.2 64.2 234.1 63.5 C234.0 62.7 233.9 61.9 233.8 61.2 C233.7 60.4 233.5 59.6 233.4 58.9 C233.3 58.1 233.2 57.2 233.0 56.5 C232.7 55.9 232.2 55.1 232.0 55.1Z\" fill=\"none\" stroke=\"#9FB3AE\" stroke-width=\".5\" opacity=\".8\"/><path d=\"M263.8 34.0 C264.1 33.7 265.1 34.2 265.7 34.9 C266.3 35.6 267.0 37.2 267.4 38.2 C267.8 39.2 267.7 40.3 268.1 41.2 C268.5 42.1 269.3 42.9 269.9 43.8 C270.5 44.7 271.1 45.5 271.7 46.5 C272.3 47.5 272.8 48.7 273.3 49.8 C273.8 50.9 274.5 52.2 274.6 53.1 C274.7 54.0 274.3 55.1 273.9 55.1 C273.5 55.1 272.7 54.0 272.1 53.1 C271.5 52.2 271.0 50.8 270.5 49.8 C270.0 48.8 269.7 47.9 269.1 46.8 C268.5 45.7 267.6 44.3 267.0 43.1 C266.4 41.9 266.1 40.9 265.5 39.8 C264.9 38.7 263.9 37.5 263.6 36.5 C263.3 35.5 263.5 34.3 263.8 34.0Z\" fill=\"#D6E2DE\" stroke=\"#9FB3AE\" stroke-width=\".9\"/><path d=\"M266.2 37.1 C266.4 36.9 266.9 37.3 267.2 37.7 C267.6 38.2 267.9 39.3 268.2 40.1 C268.4 40.8 268.3 41.5 268.5 42.2 C268.8 42.8 269.2 43.4 269.5 44.0 C269.9 44.6 270.2 45.2 270.5 45.9 C270.8 46.6 271.1 47.4 271.4 48.2 C271.7 48.9 272.1 49.9 272.1 50.5 C272.2 51.1 272.0 51.9 271.7 51.9 C271.5 51.9 271.1 51.1 270.7 50.5 C270.4 49.9 270.1 48.9 269.9 48.2 C269.6 47.4 269.4 46.9 269.1 46.1 C268.8 45.3 268.3 44.3 267.9 43.5 C267.6 42.7 267.4 41.9 267.1 41.2 C266.8 40.4 266.2 39.5 266.1 38.9 C265.9 38.2 266.0 37.3 266.2 37.1Z\" fill=\"none\" stroke=\"#9FB3AE\" stroke-width=\".5\" opacity=\".8\"/><path d=\"M224.3 88.7 C224.7 88.7 225.6 89.6 225.8 90.2 C226.0 90.8 225.8 91.9 225.6 92.5 C225.3 93.1 224.7 93.7 224.3 93.7 C223.9 93.7 223.3 93.1 223.1 92.5 C222.9 91.9 223.0 90.8 223.2 90.2 C223.4 89.6 223.9 88.7 224.3 88.7Z\" fill=\"#D6E2DE\" stroke=\"#9FB3AE\" stroke-width=\".9\"/><path d=\"M194.3 104.4 C194.6 104.4 194.9 105.4 195.2 106.1 C195.5 106.8 196.0 108.0 196.1 108.6 C196.2 109.2 195.9 109.9 195.6 109.9 C195.3 109.9 194.7 109.2 194.4 108.6 C194.1 108.0 193.7 106.8 193.7 106.1 C193.7 105.4 194.1 104.4 194.3 104.4Z\" fill=\"#D6E2DE\" stroke=\"#9FB3AE\" stroke-width=\".9\"/><text x=\"278.4\" y=\"41.5\" class=\"d-ital\" font-size=\"7.5\" opacity=\".75\">lac d’Annecy</text><text x=\"228.3\" y=\"68.0\" text-anchor=\"end\" class=\"d-ital\" font-size=\"7.5\" opacity=\".75\">lac du Bourget</text><path d=\"M113.4 10.0 C115.9 13.3 126.8 24.1 128.5 29.9 C130.2 35.7 126.0 40.1 123.8 44.8 C121.6 49.5 117.0 55.9 115.6 58.1 M113.4 10.0 C115.9 13.3 124.4 23.0 128.5 29.9 C132.6 36.8 135.8 45.6 137.8 51.4 C139.9 57.2 140.3 62.3 140.8 64.5 M113.4 10.0 C115.9 13.3 124.4 23.0 128.5 29.9 C132.6 36.8 135.8 45.6 137.8 51.4 C139.9 57.2 141.4 57.6 140.8 64.5 C140.2 71.4 136.2 82.5 134.3 92.8 C132.4 103.0 130.6 115.0 129.6 126.0 C128.6 137.1 128.5 149.2 128.5 159.1 C128.5 169.0 129.2 181.1 129.4 185.5 M113.4 10.0 C115.9 13.3 124.4 23.0 128.5 29.9 C132.6 36.8 135.8 45.6 137.8 51.4 C139.9 57.2 141.4 57.6 140.8 64.5 C140.2 71.4 136.2 82.5 134.3 92.8 C132.4 103.0 130.6 115.0 129.6 126.0 C128.6 137.1 128.5 149.2 128.5 159.1 C128.5 169.0 130.2 180.2 129.4 185.5 C128.6 190.8 125.5 189.0 123.8 190.6 C122.1 192.2 120.1 194.3 119.4 195.1 M113.4 10.0 C115.9 13.3 124.4 23.0 128.5 29.9 C132.6 36.8 135.8 45.6 137.8 51.4 C139.9 57.2 139.7 60.1 140.8 64.5 C142.0 68.9 140.9 74.3 144.7 77.9 C148.4 81.5 156.9 84.1 163.3 86.2 C169.7 88.3 178.0 89.2 183.0 90.4 C188.0 91.7 191.2 90.5 193.5 93.7 C195.8 96.9 195.8 104.4 197.0 109.4 C198.2 114.4 200.4 120.2 200.5 123.5 C200.6 126.8 196.8 127.2 197.6 129.3 C198.4 131.4 202.2 132.1 205.1 135.9 C208.0 139.7 213.3 149.6 215.0 152.3 M113.4 10.0 C115.9 13.3 124.4 23.0 128.5 29.9 C132.6 36.8 135.8 45.6 137.8 51.4 C139.9 57.2 139.7 60.1 140.8 64.5 C142.0 68.9 140.9 74.3 144.7 77.9 C148.4 81.5 156.9 84.1 163.3 86.2 C169.7 88.3 178.0 89.2 183.0 90.4 C188.0 91.7 189.0 93.0 193.5 93.7 C198.0 94.4 205.0 94.4 209.8 94.5 C214.6 94.6 217.7 95.3 222.5 94.5 C227.3 93.7 236.0 90.2 238.7 89.4 M113.4 10.0 C115.9 13.3 124.4 23.0 128.5 29.9 C132.6 36.8 135.8 45.6 137.8 51.4 C139.9 57.2 139.7 60.1 140.8 64.5 C142.0 68.9 140.9 74.3 144.7 77.9 C148.4 81.5 156.9 84.1 163.3 86.2 C169.7 88.3 178.0 89.2 183.0 90.4 C188.0 91.7 189.0 93.0 193.5 93.7 C198.0 94.4 205.0 94.4 209.8 94.5 C214.6 94.6 217.7 95.3 222.5 94.5 C227.3 93.7 236.2 93.5 238.7 89.4 C241.2 85.3 237.2 75.8 237.6 69.7 C238.0 63.7 237.0 59.0 241.1 53.1 C245.2 47.2 258.8 37.6 262.3 34.5 M115.6 58.1 C118.3 59.2 126.9 62.0 131.9 64.7 C137.0 67.5 140.7 71.0 145.9 74.6 C151.1 78.2 157.1 83.6 163.3 86.2 C169.5 88.8 178.0 89.2 183.0 90.4 C188.0 91.7 191.2 90.5 193.5 93.7 C195.8 96.9 195.8 104.4 197.0 109.4 C198.2 114.4 200.4 120.2 200.5 123.5 C200.6 126.8 196.8 127.2 197.6 129.3 C198.4 131.4 202.2 132.1 205.1 135.9 C208.0 139.7 213.3 149.6 215.0 152.3 M115.6 58.1 C118.3 59.2 126.9 62.0 131.9 64.7 C137.0 67.5 140.7 71.0 145.9 74.6 C151.1 78.2 157.1 83.6 163.3 86.2 C169.5 88.8 178.0 89.2 183.0 90.4 C188.0 91.7 191.2 90.5 193.5 93.7 C195.8 96.9 195.8 104.4 197.0 109.4 C198.2 114.4 200.4 120.2 200.5 123.5 C200.6 126.8 199.9 126.4 197.6 129.3 C195.3 132.2 189.5 137.6 186.5 140.9 C183.5 144.2 182.5 146.2 179.6 149.2 C176.7 152.2 170.8 157.4 169.1 159.0 M129.4 185.5 C130.8 184.1 133.5 179.9 137.8 176.9 C142.1 173.9 150.0 170.4 155.2 167.4 C160.4 164.4 165.0 162.0 169.1 159.0 C173.2 156.0 176.7 152.2 179.6 149.2 C182.5 146.2 183.5 144.2 186.5 140.9 C189.5 137.6 194.5 130.1 197.6 129.3 C200.7 128.5 202.2 132.1 205.1 135.9 C208.0 139.7 213.3 149.6 215.0 152.3 M129.4 185.5 C130.8 184.1 133.5 179.9 137.8 176.9 C142.1 173.9 150.0 170.4 155.2 167.4 C160.4 164.4 166.8 160.4 169.1 159.0 M119.4 195.1 C120.1 194.3 122.1 192.2 123.8 190.6 C125.5 189.0 127.1 187.8 129.4 185.5 C131.7 183.2 133.5 179.9 137.8 176.9 C142.1 173.9 150.0 170.4 155.2 167.4 C160.4 164.4 165.0 162.0 169.1 159.0 C173.2 156.0 176.7 152.2 179.6 149.2 C182.5 146.2 183.5 144.2 186.5 140.9 C189.5 137.6 194.5 130.1 197.6 129.3 C200.7 128.5 202.2 132.1 205.1 135.9 C208.0 139.7 213.3 149.6 215.0 152.3 M119.4 195.1 C120.1 194.3 122.1 192.2 123.8 190.6 C125.5 189.0 127.1 187.8 129.4 185.5 C131.7 183.2 133.5 179.9 137.8 176.9 C142.1 173.9 150.0 170.4 155.2 167.4 C160.4 164.4 166.8 160.4 169.1 159.0 M238.7 89.4 C241.2 91.4 252.2 97.2 253.9 101.1 C255.7 105.0 252.1 106.1 249.2 112.7 C246.3 119.3 242.2 134.3 236.5 140.9 C230.8 147.5 218.6 150.4 215.0 152.3 M238.7 89.4 C241.2 91.4 252.2 97.2 253.9 101.1 C255.7 105.0 252.1 106.1 249.2 112.7 C246.3 119.3 242.2 134.3 236.5 140.9 C230.8 147.5 220.2 153.1 215.0 152.3 C209.8 151.5 208.0 139.7 205.1 135.9 C202.2 132.1 200.7 128.5 197.6 129.3 C194.5 130.1 189.5 137.6 186.5 140.9 C183.5 144.2 182.5 146.2 179.6 149.2 C176.7 152.2 170.8 157.4 169.1 159.0 M215.0 152.3 C213.3 149.6 208.0 139.7 205.1 135.9 C202.2 132.1 200.7 128.5 197.6 129.3 C194.5 130.1 189.5 137.6 186.5 140.9 C183.5 144.2 182.5 146.2 179.6 149.2 C176.7 152.2 170.8 157.4 169.1 159.0\" stroke=\"#24403B\" stroke-opacity=\".16\" stroke-width=\"1.2\" fill=\"none\"/><path d=\"M110.4 22.0 L126.4 14.0 M112.4 26.0 L128.4 18.0\" stroke=\"#24403B\" stroke-width=\"1.6\"/><path d=\"M111.4 24.0 L127.4 16.0\" stroke=\"#FBF6EA\" stroke-width=\"2.4\"/><text x=\"131.4\" y=\"19.0\" class=\"d-ital\" font-size=\"11\">vers Paris</text><path d=\"M183.4 20.0 V12.0 M180.4 15.0 L183.4 12.0 L186.4 15.0\" stroke=\"#24403B\" stroke-width=\"1\" fill=\"none\"/><g class=\"rose\" data-action=\"rose\" style=\"transform-origin:296px 196px\"><circle cx=\"296\" cy=\"196\" r=\"16\" fill=\"transparent\"/><circle cx=\"296\" cy=\"196\" r=\"9\" fill=\"none\" stroke=\"#B79B5E\" stroke-width=\".7\"/><path d=\"M296 181 L299 196 L296 211 L293 196Z\" fill=\"#24403B\"/><path d=\"M281 196 L296 199 L311 196 L296 193Z\" fill=\"#FBF6EA\" stroke=\"#24403B\" stroke-width=\".8\"/><text x=\"296\" y=\"177\" text-anchor=\"middle\" class=\"d-ital\" font-size=\"9\">N</text></g>";
  const CARTE_XY = {"N0": [113.4, 10.0], "N1": [128.5, 29.9], "N2": [137.8, 51.4], "STEX": [140.8, 64.5], "PDa": [123.8, 44.8], "PD": [115.6, 58.1], "SQF": [144.7, 77.9], "BOU": [163.3, 86.2], "TDP": [183.0, 90.4], "SAG": [193.5, 93.7], "SAG2": [197.0, 109.4], "VOI": [200.5, 123.5], "MOI": [197.6, 129.3], "VOR": [205.1, 135.9], "GRE": [215.0, 152.3], "LM1": [134.3, 92.8], "LM2": [129.6, 126.0], "LM3": [128.5, 159.1], "VTGV": [129.4, 185.5], "VV1": [123.8, 190.6], "VVIL": [119.4, 195.1], "CH1": [209.8, 94.5], "CH2": [222.5, 94.5], "CHA": [238.7, 89.4], "AIX": [237.6, 69.7], "AN1": [241.1, 53.1], "ANN": [262.3, 34.5], "ROM": [137.8, 176.9], "RS1": [155.2, 167.4], "STM": [169.1, 159.0], "VIN": [179.6, 149.2], "VM1": [186.5, 140.9], "MON": [253.9, 101.1], "PON": [249.2, 112.7], "BRI": [236.5, 140.9], "LG1": [131.9, 64.7], "LG2": [145.9, 74.6]};
  const CARTE_TGV = {"LYON (intramuros)": ["N0", "N1", "PDa", "PD"], "LYON ST EXUPERY TGV.": ["N0", "N1", "N2", "STEX"], "VALENCE TGV AUVERGNE RHONE ALPES": ["N0", "N1", "N2", "STEX", "LM1", "LM2", "LM3", "VTGV"], "VALENCE VILLE": ["N0", "N1", "N2", "STEX", "LM1", "LM2", "LM3", "VTGV", "VV1", "VVIL"], "GRENOBLE": ["N0", "N1", "N2", "STEX", "SQF", "BOU", "TDP", "SAG", "SAG2", "VOI", "MOI", "VOR", "GRE"], "CHAMBERY CHALLES LES EAUX": ["N0", "N1", "N2", "STEX", "SQF", "BOU", "TDP", "SAG", "CH1", "CH2", "CHA"], "ANNECY": ["N0", "N1", "N2", "STEX", "SQF", "BOU", "TDP", "SAG", "CH1", "CH2", "CHA", "AIX", "AN1", "ANN"]};
  const CARTE_TER = {"LYON>GRENOBLE": ["PD", "LG1", "LG2", "BOU", "TDP", "SAG", "SAG2", "VOI", "MOI", "VOR", "GRE"], "LYON>ST_MARCELLIN": ["PD", "LG1", "LG2", "BOU", "TDP", "SAG", "SAG2", "VOI", "MOI", "VM1", "VIN", "STM"], "VALENCE_TGV>GRENOBLE": ["VTGV", "ROM", "RS1", "STM", "VIN", "VM1", "MOI", "VOR", "GRE"], "VALENCE_TGV>ST_MARCELLIN": ["VTGV", "ROM", "RS1", "STM"], "VALENCE_VILLE>GRENOBLE": ["VVIL", "VV1", "VTGV", "ROM", "RS1", "STM", "VIN", "VM1", "MOI", "VOR", "GRE"], "VALENCE_VILLE>ST_MARCELLIN": ["VVIL", "VV1", "VTGV", "ROM", "RS1", "STM"], "CHAMBERY>GRENOBLE": ["CHA", "MON", "PON", "BRI", "GRE"], "CHAMBERY>ST_MARCELLIN": ["CHA", "MON", "PON", "BRI", "GRE", "VOR", "MOI", "VM1", "VIN", "STM"], "GRENOBLE>ST_MARCELLIN": ["GRE", "VOR", "MOI", "VM1", "VIN", "STM"]};
  const CARTE_VILLES = {"Grenoble": "GRE", "Saint Marcellin": "STM", "Lyon": "PD", "Valence": "VTGV", "Chambéry": "CHA", "Annecy": "ANN"};
  const CARTE_ETIQ = {"Grenoble": [8, -2, "start"], "Saint Marcellin": [7, 14, "start"], "Lyon": [-8, 5, "end"], "Valence": [-8, 5, "end"], "Chambéry": [8, 4, "start"], "Annecy": [-8, -3, "end"]};
  const CARTE_GARE = {"GRENOBLE": "GRE", "LYON (intramuros)": "PD", "LYON ST EXUPERY TGV.": "STEX", "VALENCE TGV AUVERGNE RHONE ALPES": "VTGV", "VALENCE VILLE": "VVIL", "CHAMBERY CHALLES LES EAUX": "CHA", "ANNECY": "ANN"};
  const CARTE_NOEUD = {"LYON": "PD", "VALENCE_TGV": "VTGV", "VALENCE_VILLE": "VVIL", "CHAMBERY": "CHA", "GRENOBLE": "GRE"};
  /* fin du bloc généré */

  /* Courbe douce qui passe par tous les points. */
  function lisseCarte(pts) {
    let d = `M${pts[0][0]} ${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0]} ${p2[1]}`;
    }
    return d;
  }
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
    const pts = (l) => l.map((k) => CARTE_XY[k]);
    const morceaux = [{ mode: 'tgv', pts: pts(tgv) }];
    if (ter) morceaux.push({ mode: 'ter', pts: pts(ter) });
    if (sens === 'retour') {
      morceaux.reverse();
      for (const m of morceaux) m.pts = [...m.pts].reverse();
    }
    const bout = ter ? ter[ter.length - 1] : tgv[tgv.length - 1];
    return { morceaux, arret: ter ? CARTE_NOEUD[noeud] : null, bout };
  }

  function traitCarte(d, mode, actif) {
    if (!actif) return `<path d="${d}" stroke="#B79B5E" stroke-width="1.4" fill="none" stroke-dasharray="2 4"/>`;
    return mode === 'tgv'
      ? `<path d="${d}" stroke="#24403B" stroke-width="5.5" fill="none" stroke-linejoin="round"/><path d="${d}" stroke="#FBF6EA" stroke-width="3" fill="none" stroke-dasharray="7 7"/>`
      : `<path d="${d}" stroke="#24403B" stroke-width="3.6" fill="none" stroke-linejoin="round"/><path d="${d}" stroke="#FBF6EA" stroke-width="1.6" fill="none" stroke-dasharray="3 3"/>`;
  }

  function repere(d, debut, fin) {
    return `<g opacity="0"><circle r="8.5" fill="#C8662F" opacity=".25"/><circle r="4.5" fill="#C8662F" stroke="#24403B" stroke-width=".8"/>
<animateMotion path="${d}" dur="7s" repeatCount="indefinite" keyPoints="0;0;1;1" keyTimes="0;${debut.toFixed(3)};${fin.toFixed(3)};1" calcMode="linear"/>
<animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="0;${Math.max(0, debut - 0.001).toFixed(3)};${debut.toFixed(3)};${fin.toFixed(3)};${Math.min(1, fin + 0.015).toFixed(3)};1" dur="7s" repeatCount="indefinite"/></g>`;
  }

  /* Petit mot posé près d'une gare de correspondance. */
  const MOT_ARRET = { GRE: [224, 160, 'start'], CHA: [239, 107, 'middle'], PD: [116, 45, 'middle'], VTGV: [139, 183, 'start'], VVIL: [113, 214, 'middle'] };
  const PETITES_GARES = { STEX: ['St‑Exupéry', 148, 62, 'start'], VVIL: ['Valence Ville', 105, 204, 'end'] };

  function dessinCarte(a0, r0) {
    const r = etat.r;
    const cotes = r.mode === 'ar'
      ? [['aller', a0, r.aller, 0, 0.42], ['retour', r0, r.retour, 0.5, 0.92]]
      : [[r.sensSimple, a0, r.aller, 0, 0.85]];
    let routes = '';
    let reperes = '';
    const choisies = new Map();
    const arrets = new Set();
    const bouts = new Set();
    for (const [sens, x, ville, debut, fin] of cotes) {
      const it = itineraire(sens, x, ville);
      choisies.set(ville, (choisies.get(ville) || false) || !!x);
      if (x) {
        if (it.arret) arrets.add(it.arret);
        bouts.add(it.bout);
      }
      const total = it.morceaux.reduce((l, m) => l + longueur(m.pts), 0);
      const pause = it.morceaux.length > 1 ? 0.03 : 0;
      let t = debut;
      for (const m of it.morceaux) {
        const d = lisseCarte(m.pts);
        routes += traitCarte(d, m.mode, !!x);
        const part = ((fin - debut - pause) * longueur(m.pts)) / total;
        if (x) reperes += repere(d, t, t + part);
        t += part + pause;
      }
    }
    let gares = '';
    for (const [ville, cle] of Object.entries(CARTE_VILLES)) {
      const [x, y] = CARTE_XY[cle];
      const [dx, dy, ancre] = CARTE_ETIQ[ville];
      const choisie = choisies.has(ville);
      const zero = choisies.get(ville) === true;
      gares += `<g opacity="${choisie || arrets.has(cle) ? 1 : 0.4}"><circle cx="${x}" cy="${y}" r="5" fill="#FBF6EA" stroke="#24403B" stroke-width="1.6"/><circle cx="${x}" cy="${y}" r="1.9" fill="${zero ? '#C8662F' : '#24403B'}"/><text x="${x + dx}" y="${y + dy}" text-anchor="${ancre}" class="d-ital" font-size="${choisie ? 13.5 : 10.5}">${esc(court(ville))}</text></g>`;
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
