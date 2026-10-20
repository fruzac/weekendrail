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
  const DEFAUT = { mode: 'ar', sensSimple: 'aller', aller: 'Grenoble', retour: 'Grenoble', ad: 12, aa: 37, rd: 41, ra: 78, payants: false, correspondances: true };
  const CLE_STOCKAGE = 'weekendrail:reglages:v3';
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
  const LOGO = `<svg class="logo" viewBox="0 0 54 40" aria-hidden="true"><path d="M4 6 H50 V15 A5 5 0 0 0 50 25 V34 H4 V25 A5 5 0 0 0 4 15 Z" fill="#FFFFFF"/><path d="M36 9 V31" stroke="#0B4F5C" stroke-width="2" stroke-dasharray="2 3"/><text x="20" y="25" text-anchor="middle" font-family="Outfit, sans-serif" font-weight="800" font-size="14" fill="#F07A3A">0€</text><circle cx="44" cy="20" r="3" fill="#0B4F5C"/></svg>`;

  function construire() {
    document.getElementById('app').innerHTML = `<header class="tete" id="tete">
<span class="halo" aria-hidden="true"></span>
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
<section class="resultat" aria-label="Réponse"><div id="verdict"></div><div id="plan"></div></section>
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
    }
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
    majDates();
    majSemaines();
    majVilles();
    majCoches();
    majPlan(ev);
    majVerdict(ev);
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
      return `<span class="${classes}" style="left:${pct(x.h)}"></span>`;
    }).join('')).join('');
    poser('coches', html);
  }

  const quand = (x) => `${JOURS[Math.floor(x.h / 24)]} ${heure(x.depart)}`;

  /* Un trajet du plan : gare de départ et heure, la voie, gare d'arrivée et heure. */
  function voie(mot, x, de, a) {
    const arrivee = x ? enHeure(x.fin) : '';
    return `<div class="p-trajet${x ? ' on' : ''}">
<div class="p-tete"><span class="p-mot">${mot}</span><span class="p-jour">${x ? `${JOURS[Math.floor(x.h / 24)]} · 0€` : (publie(etat.vendredi) ? 'rien dans ta plage' : 'pas encore publié')}</span></div>
<div class="p-gare"><span class="p-nom">${esc(de)}</span><span class="p-heure">${x ? heure(x.depart) : ''}</span></div>
<div class="p-ligne" aria-hidden="true"><span class="p-rail"></span>${x ? '<span class="p-objet"><i></i><i></i><i></i></span>' : ''}<span class="p-st de"></span><span class="p-st a"></span></div>
<div class="p-gare droite"><span class="p-nom">${esc(a)}</span><span class="p-heure">${arrivee}</span></div>
</div>`;
  }

  function majPlan(ev) {
    const r = etat.r;
    // Le plan montre le même couple de trains que la réponse.
    const a0 = ev.meilleur ? ev.meilleur.a : ev.zA[0];
    const r0 = ev.meilleur ? ev.meilleur.r : ev.zR[0];
    let html;
    if (r.mode === 'ar') {
      html = voie('Aller', a0, 'Paris', court(r.aller)) + voie('Retour', r0, court(r.retour), 'Paris');
    } else {
      const aller = r.sensSimple === 'aller';
      html = voie('Trajet', a0, aller ? 'Paris' : court(r.aller), aller ? court(r.aller) : 'Paris');
    }
    poser('plan', html);
    const force = ev.meilleur || (r.mode === 'simple' && a0) ? 0.5 : (a0 || r0 ? 0.28 : 0.1);
    document.querySelector('.halo').style.setProperty('--force', force);
  }

  function majVerdict(ev) {
    const r = etat.r;
    let oui = false;
    let titre;
    let sous;
    let badge = '';
    if (r.mode === 'simple') {
      if (ev.zA.length) {
        oui = true;
        titre = ev.zA.length === 1 ? 'Oui, un train à 0€' : `Oui, ${ev.zA.length} trains à 0€`;
        sous = ev.zA.slice(0, 4).map(quand).join(' · ');
      } else {
        titre = 'Rien à 0€ pour l’instant';
        sous = 'dans ta plage, sur ce weekend';
      }
    } else if (ev.meilleur) {
      const { a, r: re, sur } = ev.meilleur;
      oui = true;
      titre = 'Oui, tu peux partir';
      const lieu = r.aller === r.retour ? court(r.aller) : `${court(r.aller)}, retour de ${court(r.retour)}`;
      sous = `${quand(a)} → ${quand(re)} · ${lieu}`;
      badge = `<span class="v-heures"><b>${sur} h</b><small>sur place</small></span>`;
    } else if (ev.zA.length) {
      titre = 'Aller oui, retour pas encore';
      sous = 'aucun retour à 0€ dans ta plage';
    } else if (ev.zR.length) {
      titre = 'Retour oui, aller pas encore';
      sous = 'aucun aller à 0€ dans ta plage';
    } else {
      titre = 'Pas de 0€ dans tes plages';
      sous = 'élargis une plage ou change de ville';
    }
    if (!publie(etat.vendredi)) {
      oui = false;
      badge = '';
      titre = 'Pas encore publié';
      sous = `la SNCF ouvre les places MAX 30 jours avant : à partir du ${jourDuMois(ajouterJours(etat.vendredi, -30))} ${MOIS_COURT[moisDe(ajouterJours(etat.vendredi, -30))]}`;
    }
    const raccourci = oui ? '' : '<button type="button" class="v-antic" data-action="antic-depuis-recherche">Noter une anticipation</button>';
    poser('verdict', `<div class="verdict ${oui ? 'oui' : 'non'}"><div class="v-texte"><span class="v-titre">${esc(titre)}</span><span class="v-sous">${esc(sous)}</span>${raccourci}</div>${badge}</div>`);
  }

  const enDuree = (min) => `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;

  /* La barre TGV / TER d'une correspondance, longueurs proportionnelles aux durées. */
  function etapes(x) {
    const cols = x.etapes.map((e) => `${Math.max(e.min, 15)}fr`).join(' ');
    const traits = x.etapes.map((e) => `<span class="e-trait ${e.mode.toLowerCase()}"></span>`).join('');
    const mots = x.etapes.map((e, i) => `<span class="e-mot${i ? ' droite' : ''}">${e.mode}${e.zero ? ' 0€' : ''}</span>`).join('');
    return `<span class="etapes" style="grid-template-columns:${cols}" aria-hidden="true">${traits}${mots}</span>`;
  }

  /* La carte d'un train : un billet. Départ, durée et arrivée empilés à gauche, talon « 0€ » à droite. */
  function rangee(x) {
    const parti = estParti(x.date, x.depart);
    const milieu = `${enDuree(x.duree)} · ${esc(x.precision)}`;
    const corps = `<span class="b-rail${x.type === 'via' ? ' via' : ''}" aria-hidden="true"><i class="b-pt"></i><i class="b-trait"></i><i class="b-pt b-fin"></i></span>
<span class="b-corps"><span class="b-ligne"><b class="b-h">${heure(x.depart)}</b><span class="b-gare">${esc(x.gareDe)}</span></span>
<span class="b-milieu">${milieu}</span>${x.type === 'via' ? etapes(x) : ''}
<span class="b-ligne"><b class="b-h">${x.arrivee}</b><span class="b-gare">${esc(x.gareA)}</span></span></span>`;
    if (parti) return `<div class="billet ${x.type} parti">${corps}<span class="b-talon">parti</span></div>`;
    const quoi = `${heure(x.depart)} ${x.gareDe} vers ${x.gareA}, arrivée ${x.arrivee}, ${x.precision}`;
    return `<a class="billet ${x.type}" href="${esc(x.lien)}" target="_blank" rel="noopener" aria-label="${esc(quoi)}, 0€, ouvrir dans SNCF Connect">${corps}<span class="b-talon">0€<small>ouvrir${FLECHE}</small></span></a>`;
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

  function blocJour(c, i, nouveaux) {
    const date = ajouterJours(etat.vendredi, i);
    const tous = trajets(c.sens, c.ville).filter((x) => x.date === date && dans(x, c.de, c.a));
    const zero = tous.filter((x) => x.zero);
    const payants = tous.filter((x) => !x.zero);
    const libres = zero.filter((x) => !estParti(x.date, x.depart));
    const cle = `${c.cle}|${date}`;
    const ouvert = etat.ouverts.get(cle) === true;
    const resume = date > (etat.fin || '') ? '<span class="j-rien">pas encore publié</span>' : libres.length === 0
      ? '<span class="j-rien">aucun 0€</span>'
      : `<span class="j-zero">${libres.length === 1 ? `${heure(libres[0].depart)} à 0€` : `${libres.length} trains à 0€`}</span>`;
    const avecPayants = etat.r.payants && payants.length > 0;
    if (!zero.length && !avecPayants) {
      return `<div class="jour fixe"><div class="j-tete"><span class="j-nom">${JOURS_NOMS[i]} ${jourDuMois(date)}</span><span class="j-resume">${resume}</span></div></div>`;
    }
    let dedans = zero.map((x) => rangee(x)).join('');
    if (!zero.length) dedans += '<p class="vide">Rien à 0€ dans ta plage.</p>';
    if (avecPayants) dedans += lignePayants(payants);
    return `<div class="jour${ouvert ? ' ouvert' : ''}${libres.length ? ' a-zero' : ''}" data-cle="${cle}">
<button type="button" class="j-tete" data-action="jour" aria-expanded="${ouvert}"><span class="j-nom">${JOURS_NOMS[i]} ${jourDuMois(date)}</span><span class="j-resume">${resume}</span>${CHEVRON}</button>
<div class="j-corps"><div class="j-dedans">${dedans}</div></div>
</div>`;
  }

  function section(c, mot, trajet, plage, nouveaux) {
    let html = `<h2 class="s-titre"><span class="mot">${mot}</span><span class="trajet">${esc(trajet)}</span><span class="plage">${esc(plage)}</span></h2>`;
    for (let i = 0; i < 4; i++) {
      if (c.a <= i * 24 || c.de >= (i + 1) * 24) continue;
      html += blocJour(c, i, nouveaux);
    }
    return `<section class="section">${html}</section>`;
  }

  function majCorps() {
    const r = etat.r;
    const nouveaux = new Set((etat.donnees.changements || []).filter((x) => x.zero && x.avant === false).map(cleTrain));
    const cs = cotes();
    const plage = (de, a) => `${libelleHeure(de)} → ${libelleHeure(a)}`;
    const html = r.mode === 'ar'
      ? section(cs[0], 'Aller', `Paris → ${court(r.aller)}`, plage(r.ad, r.aa), nouveaux)
        + section(cs[1], 'Retour', `${court(r.retour)} → Paris`, plage(r.rd, r.ra), nouveaux)
      : section(cs[0], 'Trajet', r.sensSimple === 'aller' ? `Paris → ${court(r.aller)}` : `${court(r.aller)} → Paris`, plage(r.ad, r.aa), nouveaux);
    const avecStats = etat.stats && Object.keys(etat.stats.trains || {}).length;
    const ter = etat.ter && etat.ter.genere ? ` Horaires TER du ${esc(instant(etat.ter.genere))}.` : '';
    const minimum = (etat.stats && etat.stats.minimum) || 4;
    const note = r.payants
      ? (avecStats ? 'Pourcentage : la part des weekends relevés où ce train payant est passé à 0€ avant le départ. ' : `Les pourcentages des payants apparaîtront après ${minimum} weekends relevés. `)
      : '';
    poser('corps', `${html}<p class="pied">${note}Open data SNCF du ${esc(instant(etat.donnees.maj_sncf))}, mis à jour une fois par jour : vérifie sur SNCF Connect avant de réserver.${ter}</p>`);
  }

  /* ---------- Plier et déplier en douceur ---------- */

  let pret = false; // pas d'animation au premier affichage
  const calme = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function plier(el, ouvrir, bascule) {
    const avant = el.getBoundingClientRect().height;
    if (bascule) bascule();
    else el.classList.toggle('ouvert', ouvrir);
    if (el._anim) el._anim.cancel();
    const apres = ouvrir ? el.scrollHeight : 0;
    if (calme || !pret || avant === apres || !el.animate) return;
    el._anim = el.animate(
      [{ height: `${avant}px`, opacity: ouvrir ? 0.4 : 1 }, { height: `${apres}px`, opacity: ouvrir ? 1 : 0 }],
      { duration: 300, easing: 'cubic-bezier(.25, .8, .25, 1)' },
    );
    el._anim.onfinish = () => { el._anim = null; };
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

  function changer(fn, reglages = true) {
    fn();
    etat.ouverts.clear();
    sauver();
    if (reglages) majReglages();
    majResultats();
  }

  const LIMITES = {
    ad: (v, r) => Math.max(DEBUT, Math.min(v, r.aa - 1)),
    aa: (v, r) => Math.max(r.ad + 1, Math.min(v, FIN)),
    rd: (v, r) => Math.max(DEBUT, Math.min(v, r.ra - 1)),
    ra: (v, r) => Math.max(r.rd + 1, Math.min(v, FIN)),
  };

  // Pendant le glissement : frise, coches et points des villes seulement. Au lâcher : tout le reste.
  let aBouge = false;
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
    aBouge = true;
    majPlages();
    sauver();
    if (!attenteFrise) {
      attenteFrise = true;
      requestAnimationFrame(() => {
        attenteFrise = false;
        majCoches();
      });
    }
    clearTimeout(attenteResultats);
    attenteResultats = setTimeout(appliquerPlages, 450);
  }

  function appliquerPlages() {
    clearTimeout(attenteResultats);
    etat.ouverts.clear();
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
      changer(() => { r[cle] = b.dataset.ville; });
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
    majReglages();
    majResultats();
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
