(() => {
  'use strict';

  const VILLES = ['Grenoble', 'Saint Marcellin', 'Lyon', 'Valence', 'Chambéry', 'Annecy'];
  const JOURS = [
    { cle: 'ven', nom: 'Vendredi', court: 'Ven', sens: 'aller', decalage: 0 },
    { cle: 'sam', nom: 'Samedi', court: 'Sam', sens: 'aller', decalage: 1 },
    { cle: 'dim', nom: 'Dimanche', court: 'Dim', sens: 'retour', decalage: 2 },
    { cle: 'lun', nom: 'Lundi', court: 'Lun', sens: 'retour', decalage: 3 },
  ];
  const MOMENTS = [
    { cle: 'matin', nom: 'Matin', aide: 'avant 12h' },
    { cle: 'aprem', nom: 'Aprem', aide: '12h à 18h' },
    { cle: 'soir', nom: 'Soir', aide: 'après 18h' },
  ];
  const BORNES = { matin: [0, 12], aprem: [12, 18], soir: [18, 24] };
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
  const NOM_NOEUD = {
    LYON: 'Lyon Part-Dieu', VALENCE_TGV: 'Valence TGV', VALENCE_VILLE: 'Valence Ville',
    CHAMBERY: 'Chambéry', GRENOBLE: 'Grenoble', ST_MARCELLIN: 'Saint Marcellin',
  };
  const NOM_VIA = {
    LYON: 'Lyon', VALENCE_TGV: 'Valence TGV', VALENCE_VILLE: 'Valence Ville', CHAMBERY: 'Chambéry', GRENOBLE: 'Grenoble',
  };
  const FINALES = { Grenoble: 'GRENOBLE', 'Saint Marcellin': 'ST_MARCELLIN' };
  const CORRESPONDANCE_MIN = { LYON: 15 };
  const CORRESPONDANCE_DEFAUT = 8;
  const ATTENTE_MAX = 75;
  const TOTAL_MAX = 240;

  const DEFAUT = {
    aller: ['Grenoble'],
    retour: ['Grenoble'],
    synchro: true,
    tout: false,
    payants: false,
    creneaux: { ven: ['soir'], sam: ['matin'], dim: ['aprem', 'soir'], lun: ['matin'] },
  };
  const CLE_STOCKAGE = 'weekendrail:reglages:v1';
  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const MOIS_COURT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const JOURS_COURTS = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
  const ICONES = {
    gauche: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>',
    droite: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>',
    reglages: '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4"/></svg>',
    chevron: '<svg class="chev" aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M6 9l6 6 6-6"/></svg>',
    ouvrir: '<svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M8 7h9v9"/></svg>',
  };

  const etat = { reglages: chargerReglages(), donnees: null, ter: null, vendredi: null, combo: null, sens: 'aller', ouverts: null, cache: new Map() };

  /* ---------- Réglages ---------- */

  function chargerReglages() {
    let lu = {};
    try {
      lu = JSON.parse(localStorage.getItem(CLE_STOCKAGE) || '{}') || {};
    } catch (e) {
      lu = {};
    }
    const villes = (liste, defaut) => {
      const ok = Array.isArray(liste) ? liste.filter((v) => VILLES.includes(v)) : [];
      return ok.length ? ok : [...defaut];
    };
    const creneaux = {};
    for (const j of JOURS) {
      const l = lu.creneaux && Array.isArray(lu.creneaux[j.cle]) ? lu.creneaux[j.cle] : DEFAUT.creneaux[j.cle];
      creneaux[j.cle] = l.filter((m) => m in BORNES);
    }
    return {
      aller: villes(lu.aller, DEFAUT.aller),
      retour: villes(lu.retour, DEFAUT.retour),
      synchro: typeof lu.synchro === 'boolean' ? lu.synchro : DEFAUT.synchro,
      tout: typeof lu.tout === 'boolean' ? lu.tout : DEFAUT.tout,
      payants: typeof lu.payants === 'boolean' ? lu.payants : DEFAUT.payants,
      creneaux,
    };
  }

  function sauverReglages() {
    try {
      localStorage.setItem(CLE_STOCKAGE, JSON.stringify(etat.reglages));
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
  const jourCourt = (iso) => JOURS_COURTS[versDate(iso).getUTCDay()];

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
    const m = ((min % 1440) + 1440) % 1440;
    return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
  };
  const heure = (hhmm) => enHeure(minutes(hhmm));
  const enDuree = (min) => `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;
  const moment = (hhmm) => {
    const h = Number(hhmm.slice(0, 2));
    return h < 12 ? 'matin' : h < 18 ? 'aprem' : 'soir';
  };
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

  /* ---------- Données ---------- */

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const cleTrain = (t) => [t.date, t.train, t.origine, t.destination].join('|');

  function nomGare(brut) {
    if (GARES[brut]) return GARES[brut];
    return String(brut).toLowerCase().replace(/(^|[\s(])\S/g, (c) => c.toUpperCase());
  }

  function weekends() {
    const dates = etat.donnees.trains.map((t) => t.date).sort();
    const liste = [];
    if (!dates.length) return liste;
    const fin = dates[dates.length - 1];
    for (let v = vendrediDe(dates[0]); v <= fin; v = ajouterJours(v, 7)) liste.push(v);
    return liste;
  }

  const villesPour = (sens) => (sens === 'aller' ? etat.reglages.aller : etat.reglages.retour);
  const creneauxDe = (jour) => etat.reglages.creneaux[jour.cle] || [];
  const dansCreneau = (jour, depart) => etat.reglages.tout || creneauxDe(jour).includes(moment(depart));

  function trainsDuJour(jour) {
    const villes = villesPour(jour.sens);
    return etat.donnees.trains.filter((t) => t.date === jour.date && t.sens === jour.sens && villes.includes(t.ville));
  }

  function indexChangements() {
    const m = new Map();
    for (const c of etat.donnees.changements || []) m.set(cleTrain(c), c);
    return m;
  }

  /* Un « trajet » est ce que la frise affiche : un TGV direct ou un TGV + TER. */
  function trajetDirect(t) {
    const aller = t.sens === 'aller';
    return {
      type: 'direct',
      cle: cleTrain(t),
      date: t.date,
      depart: t.depart,
      ville: t.ville,
      sens: t.sens,
      zero: t.zero,
      tgv: t,
      debut: absolu(t.date, t.depart),
      fin: absolu(t.date, t.depart) + dureeMinutes(t),
      lien: lienSncf(aller ? 'Paris' : nomGare(t.origine), aller ? nomGare(t.destination) : 'Paris', t.date, t.depart),
    };
  }

  function correspondances(jour) {
    const liaisons = (etat.ter && etat.ter.liaisons) || {};
    const resultats = new Map();
    const garder = (cle, c) => {
      const avant = resultats.get(cle);
      if (!avant || c.fin - c.debut < avant.fin - avant.debut) resultats.set(cle, c);
    };
    for (const ville of villesPour(jour.sens)) {
      const finale = FINALES[ville];
      if (!finale) continue;
      for (const t of etat.donnees.trains) {
        if (t.date !== jour.date || t.sens !== jour.sens || !t.zero) continue;
        const noeud = NOEUD_TGV[jour.sens === 'aller' ? t.destination : t.origine];
        if (!noeud || noeud === finale) continue;
        const marge = CORRESPONDANCE_MIN[noeud] || CORRESPONDANCE_DEFAUT;
        const tgvDebut = absolu(t.date, t.depart);
        const tgvFin = tgvDebut + dureeMinutes(t);
        if (jour.sens === 'aller') {
          const ters = (liaisons[`${noeud}>${finale}`] || {})[t.date] || [];
          const ter = ters.find(([d]) => {
            const dep = absolu(t.date, d);
            return dep >= tgvFin + marge && dep <= tgvFin + ATTENTE_MAX;
          });
          if (!ter) continue;
          const fin = absolu(t.date, ter[1]);
          if (fin - tgvDebut > TOTAL_MAX) continue;
          garder(`${ville}|${noeud}|${ter[0]}`, {
            type: 'via', cle: `${cleTrain(t)}|${ter[0]}`, date: t.date, depart: t.depart, ville, sens: 'aller', zero: true,
            noeud, tgv: t, ter: { depart: ter[0], arrivee: ter[1], car: ter[2] === 1 }, debut: tgvDebut, fin,
            lien: lienSncf('Paris', ville, t.date, t.depart),
          });
        } else {
          const ters = (liaisons[`${finale}>${noeud}`] || {})[t.date] || [];
          let ter = null;
          for (const x of ters) {
            const arr = absolu(t.date, x[1]);
            if (arr <= tgvDebut - marge && arr >= tgvDebut - ATTENTE_MAX) ter = x;
          }
          if (!ter) continue;
          const debut = absolu(t.date, ter[0]);
          if (tgvFin - debut > TOTAL_MAX) continue;
          garder(`${ville}|${noeud}|${ter[0]}`, {
            type: 'via', cle: `${cleTrain(t)}|${ter[0]}`, date: t.date, depart: ter[0], ville, sens: 'retour', zero: true,
            noeud, tgv: t, ter: { depart: ter[0], arrivee: ter[1], car: ter[2] === 1 }, debut, fin: tgvFin,
            lien: lienSncf(ville, 'Paris', t.date, ter[0]),
          });
        }
      }
    }
    return [...resultats.values()];
  }

  function trajetsDuJour(jour) {
    const cle = `${jour.date}|${jour.sens}`;
    if (!etat.cache.has(cle)) etat.cache.set(cle, calculerTrajets(jour));
    return etat.cache.get(cle);
  }

  function calculerTrajets(jour) {
    const directs = trainsDuJour(jour).map(trajetDirect);
    const via = correspondances(jour);
    return [...directs, ...via].sort((a, b) => a.debut - b.debut || (a.type === 'direct' ? -1 : 1));
  }

  function calculerCombo(jours) {
    const disponibles = (j) => trajetsDuJour(j).filter((t) => t.zero && dansCreneau(j, t.depart) && !estParti(t.date, t.depart));
    const allers = jours.filter((j) => j.sens === 'aller').flatMap(disponibles);
    const retours = jours.filter((j) => j.sens === 'retour').flatMap(disponibles);
    // Même ville à l'aller et au retour, et les villes dans l'ordre de préférence (Grenoble d'abord).
    let meilleur = null;
    for (const ville of VILLES) {
      for (const a of allers.filter((x) => x.ville === ville)) {
        for (const r of retours.filter((x) => x.ville === ville)) {
          const sur = r.debut - a.fin;
          if (sur > 0 && (!meilleur || sur > meilleur.sur)) meilleur = { a, r, sur };
        }
      }
      if (meilleur) break;
    }
    return { meilleur, allers: allers.length, retours: retours.length };
  }

  function lienSncf(origine, destination, iso, hhmm) {
    const d = versDate(iso);
    const texte = `${origine} ${destination} le ${d.getUTCDate()} ${MOIS[d.getUTCMonth()]} à ${heure(hhmm)}`;
    return `https://www.sncf-connect.com/app/home/search?userInput=${encodeURIComponent(texte)}`;
  }

  /* ---------- Affichage ---------- */

  const COURT = { l: 358, h: 214, milieu: 107 };
  const NOM_COURT = { 'Saint Marcellin': 'St Marcellin' };

  function bandeau(jours) {
    const d = etat.donnees;
    const liste = weekends();
    const i = liste.indexOf(etat.vendredi);
    const debut = versDate(jours[0].date);
    const fin = versDate(jours[3].date);
    const plage = debut.getUTCMonth() === fin.getUTCMonth()
      ? `ven ${debut.getUTCDate()} → lun ${fin.getUTCDate()} ${MOIS[fin.getUTCMonth()]}`
      : `ven ${debut.getUTCDate()} ${MOIS_COURT[debut.getUTCMonth()]} → lun ${fin.getUTCDate()} ${MOIS_COURT[fin.getUTCMonth()]}`;
    const actuel = etat.vendredi === vendrediDe(aujourdhui());
    const maj = instant(d.maj_sncf);
    const s = etat.sens;
    const bouton = (cle, texte) => `<button type="button" data-action="sens" data-sens="${cle}" aria-pressed="${s === cle}" class="${s === cle ? 'active' : ''}">${texte}</button>`;
    return `<header class="bandeau terre">
<div class="haut">
<div class="titre"><span class="sur">${maj ? `SNCF · ${esc(maj)}` : 'SNCF'}</span><h1>${actuel ? 'Ton weekend' : 'Plus tard'}</h1><span class="plage">${plage}</span></div>
<button type="button" class="rond" data-action="precedent" aria-label="Weekend précédent"${i <= 0 ? ' disabled' : ''}>${ICONES.gauche}</button>
<button type="button" class="rond" data-action="suivant" aria-label="Weekend suivant"${i >= liste.length - 1 ? ' disabled' : ''}>${ICONES.droite}</button>
</div>
<div class="sens" role="group" aria-label="Sens du schéma">${bouton('aller', 'Aller · ven, sam')}${bouton('retour', 'Retour · dim, lun')}</div>
${schema(jours)}
<div class="destinations"><div class="puces defile">${puces(villesPour(s), 'ville')}</div><button type="button" class="bouton-filtres" data-action="filtres">${ICONES.reglages}Filtres</button></div>
</header>`;
  }

  /* Le court : Paris d'un côté du filet, les destinations de l'autre. Au retour, le court se retourne. */
  function schema(jours) {
    const sens = etat.sens;
    const aller = sens === 'aller';
    const X = (x) => (aller ? x : COURT.l - x);
    const villes = villesPour(sens);
    const zero = new Set();
    for (const j of jours.filter((x) => x.sens === sens)) {
      for (const tr of trajetsDuJour(j)) {
        if (tr.zero && dansCreneau(j, tr.depart) && !estParti(tr.date, tr.depart)) zero.add(tr.ville);
      }
    }
    const n = villes.length;
    const ys = villes.map((_, k) => (n === 1 ? COURT.milieu : Math.round(40 + (k * 134) / (n - 1))));
    const chemin = (y) => `M${X(60)} ${COURT.milieu} C${X(150)} ${COURT.milieu} ${X(196)} ${y} ${X(290)} ${y}`;
    const ancre = aller ? 'end' : 'start';
    const traits = villes.map((v, k) => {
      const on = zero.has(v);
      return `<path d="${chemin(ys[k])}" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round"${on ? '' : ' stroke-dasharray="4 7" opacity="0.6"'}/>`;
    }).join('');
    const gares = villes.map((v, k) => {
      const on = zero.has(v);
      const y = ys[k];
      return `<circle cx="${X(302)}" cy="${y}" r="9" fill="${on ? '#00503C' : '#C8562A'}" stroke="#FFFFFF" stroke-width="3"/>
<text x="${X(288)}" y="${y - 9}" text-anchor="${ancre}" class="s-nom">${esc(NOM_COURT[v] || v)} <tspan class="${on ? 's-zero' : 's-rien'}">· ${on ? '0€' : 'rien'}</tspan></text>`;
    }).join('');
    const premiere = villes.findIndex((v) => zero.has(v));
    const calme = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const balle = premiere >= 0 && !calme
      ? `<circle r="5" fill="#E2E86A" stroke="#0B3A2C" stroke-width="1"><animateMotion dur="2.6s" repeatCount="indefinite" path="${chemin(ys[premiere])}" keyPoints="${aller ? '0;1' : '1;0'}" keyTimes="0;1" calcMode="linear"/></circle>`
      : '';
    const resume = villes.map((v) => `${v} ${zero.has(v) ? '0€' : 'rien'}`).join(', ');
    return `<svg class="schema" role="img" aria-label="${aller ? 'Aller, de Paris vers' : 'Retour, vers Paris depuis'} : ${esc(resume)}" viewBox="0 0 ${COURT.l} ${COURT.h}" fill="none">
<rect x="8" y="8" width="342" height="198" stroke="#FFFFFF" stroke-width="3"/>
<path d="M8 30h342M8 184h342M96 30v154M262 30v154M96 107h166" stroke="#FFFFFF" stroke-width="2" opacity="0.8"/>
<path d="M179 4v206" stroke="#FFFFFF" stroke-width="5"/>
<path d="M179 4v206" stroke="#00503C" stroke-width="1.5" stroke-dasharray="3 3"/>
${traits}
<circle cx="${X(44)}" cy="${COURT.milieu}" r="15" fill="#FFFFFF" stroke="#00503C" stroke-width="4"/>
<text x="${X(44)}" y="141" text-anchor="middle" class="s-paris">PARIS</text>
${gares}${balle}
</svg>`;
  }

  function puces(liste, action) {
    return VILLES.map((v) => {
      const on = liste.includes(v);
      return `<button type="button" class="puce${on ? ' active' : ''}" aria-pressed="${on}" data-action="${action}" data-ville="${esc(v)}">${esc(v)}</button>`;
    }).join('');
  }

  function suggestion() {
    const { meilleur, allers, retours } = etat.combo;
    if (meilleur) {
      const { a, r, sur } = meilleur;
      return `<section class="combo">
<div class="c-texte"><span class="c-sur">meilleur combo · ${esc(a.ville)}</span><span class="c-quand">${jourCourt(a.date)} ${heure(a.depart)} · ${jourCourt(r.date)} ${heure(r.depart)}</span></div>
<div class="c-heures terre">${Math.floor(sur / 60)}H</div>
</section>`;
    }
    const n = (x, mot) => `${x} ${mot}${x > 1 ? 's' : ''}`;
    return `<section class="combo">
<div class="c-texte"><span class="c-sur">pas encore de combo à 0€</span><span class="c-quand">${n(allers, 'aller')} · ${n(retours, 'retour')}</span></div>
</section>`;
  }

  function etiquettes(tr, changements, suggeres) {
    const tags = [];
    if (suggeres.has(tr.cle)) tags.push('<span class="etiquette suggere">suggéré</span>');
    const c = tr.type === 'direct' ? changements.get(tr.cle) : changements.get(cleTrain(tr.tgv));
    if (c && tr.zero && c.avant === false) tags.push('<span class="etiquette nouveau">nouveau</span>');
    return tags.length ? `<span class="etiquettes">${tags.join('')}</span>` : '';
  }

  function detail(tr) {
    const t = tr.tgv;
    if (tr.type === 'via') {
      const ter = tr.ter.car ? 'Car' : 'TER';
      return tr.sens === 'aller'
        ? `via ${esc(NOM_VIA[tr.noeud])} + ${ter} · arr. ${heure(tr.ter.arrivee)}`
        : `${ter}, puis TGV ${heure(t.depart)} à ${esc(NOM_VIA[tr.noeud])} · arr. Paris ${heure(t.arrivee)}`;
    }
    const autre = tr.sens === 'aller' ? nomGare(t.destination) : nomGare(t.origine);
    const reste = autre.startsWith(`${tr.ville} `) ? autre.slice(tr.ville.length + 1) : autre;
    const precision = autre !== tr.ville ? esc(reste) : 'direct';
    return `${precision} · ${tr.sens === 'aller' ? 'arr.' : 'arr. Paris'} ${heure(t.arrivee)}`;
  }

  function rangee(tr, changements, suggeres) {
    const parti = estParti(tr.date, tr.depart);
    const titre = tr.sens === 'aller' ? tr.ville : `${tr.ville} → Paris`;
    const contenu = `<span class="r-heure">${heure(tr.depart)}</span><span class="r-infos">${etiquettes(tr, changements, suggeres)}<span class="r-titre">${esc(titre)}</span><span class="r-detail">${detail(tr)}</span></span>`;
    if (parti) return `<div class="rangee parti">${contenu}<span class="r-prix">parti</span></div>`;
    const quoi = `${heure(tr.depart)} ${tr.sens === 'aller' ? `Paris → ${tr.ville}` : `${tr.ville} → Paris`}`;
    return `<a class="rangee" href="${esc(tr.lien)}" target="_blank" rel="noopener" aria-label="${esc(quoi)}, 0€, ouvrir dans SNCF Connect">${contenu}<span class="r-prix">0€${ICONES.ouvrir}</span></a>`;
  }

  function lignesPayants(payants) {
    const parVille = new Map();
    for (const tr of payants) {
      if (!parVille.has(tr.ville)) parVille.set(tr.ville, []);
      parVille.get(tr.ville).push(tr);
    }
    const ordre = [...parVille.entries()].sort((a, b) => VILLES.indexOf(a[0]) - VILLES.indexOf(b[0]));
    return ordre.map(([ville, liste]) => {
      const heures = liste.map((tr) => `<span class="${estParti(tr.date, tr.depart) ? 'barre-parti' : ''}">${heure(tr.depart)}</span>`).join('');
      return `<div class="p-ville"><b>${esc(ville)}</b><span class="p-heures">${heures}</span></div>`;
    }).join('');
  }

  function compteZero(j) {
    return trajetsDuJour(j).filter((tr) => tr.zero && dansCreneau(j, tr.depart) && !estParti(tr.date, tr.depart));
  }

  function blocJour(j, changements, suggeres) {
    const tous = trajetsDuJour(j);
    const visibles = tous.filter((tr) => dansCreneau(j, tr.depart));
    const zero = visibles.filter((tr) => tr.zero);
    const payants = visibles.filter((tr) => !tr.zero);
    const zeroHors = tous.filter((tr) => tr.zero && !dansCreneau(j, tr.depart)).length;
    const dispo = compteZero(j);
    let resume = '<span class="j-rien">aucun 0€</span>';
    if (dispo.length === 1) resume = `<span class="j-un">${heure(dispo[0].depart)}<span class="pastille">0€</span></span>`;
    else if (dispo.length > 1) resume = `<span class="pastille">${dispo.length} à 0€</span>`;
    const rangees = zero.map((tr) => rangee(tr, changements, suggeres)).join('');
    const vide = zero.length ? '' : '<p class="vide">Pas de 0€ pour l\'instant.</p>';
    let bas = '';
    if (payants.length) {
      const texte = `${payants.length} payant${payants.length > 1 ? 's' : ''} sur tes horaires`;
      bas = etat.reglages.payants
        ? `<div class="payants">${lignesPayants(payants)}</div><button type="button" class="pied-bloc" data-action="payants">masquer les payants</button>`
        : `<button type="button" class="pied-bloc" data-action="payants">${texte}</button>`;
    }
    const hors = zeroHors && !etat.reglages.tout
      ? `<button type="button" class="pied-bloc vert" data-action="tout">+ ${zeroHors} à 0€ hors horaires</button>`
      : '';
    const ouvert = etat.ouverts.has(j.cle);
    return `<details class="jour"${ouvert ? ' open' : ''}>
<summary data-action="jour" data-jour="${j.cle}"><span class="j-nom">${j.nom} ${jourDuMois(j.date)}</span><span class="j-sens">${j.sens}</span><span class="j-resume">${resume}</span>${ICONES.chevron}</summary>
<div class="j-corps">${rangees}${vide}${bas}${hors}</div>
</details>`;
  }

  function listeJours(jours) {
    const changements = indexChangements();
    const m = etat.combo.meilleur;
    const suggeres = new Set(m ? [m.a.cle, m.r.cle] : []);
    const revenir = etat.reglages.tout
      ? '<button type="button" class="lien" data-action="masquer">revenir à mes horaires</button>'
      : '';
    return `${revenir}<div class="jours">${jours.map((j) => blocJour(j, changements, suggeres)).join('')}</div>`;
  }

  function pied() {
    const ter = etat.ter && etat.ter.genere ? ` Horaires TER du ${esc(instant(etat.ter.genere))}.` : '';
    return `<footer class="pied">Open data SNCF, mis à jour une fois par jour : vérifie sur SNCF Connect avant de réserver.${ter}</footer>`;
  }

  function contenuFiltres() {
    const r = etat.reglages;
    const creneaux = JOURS.map((j) => `<span class="f-jour">${j.court}</span>${MOMENTS.map((m) => {
      const on = creneauxDe(j).includes(m.cle);
      return `<button type="button" class="case${on ? ' active' : ''}" aria-pressed="${on}" data-action="creneau" data-jour="${j.cle}" data-moment="${m.cle}">${m.nom.toLowerCase()}</button>`;
    }).join('')}`).join('');
    return `<form method="dialog" class="f-contenu">
<div class="f-tete"><h2>Filtres</h2><button class="bouton-filtres clair" value="ok">Fermer</button></div>
<section class="f-bloc"><h3>Aller vers</h3><div class="puces">${puces(r.aller, 'f-aller')}</div></section>
<section class="f-bloc"><h3>Retour depuis</h3><div class="puces">${puces(r.retour, 'f-retour')}</div><p>Grenoble et Saint Marcellin incluent les correspondances : TGV à 0€ jusqu'à Lyon, Valence ou Chambéry, puis TER, 4h de trajet au plus.</p></section>
<section class="f-bloc"><h3>Horaires</h3><div class="f-creneaux">${creneaux}</div>
<label class="interrupteur"><input type="checkbox" data-action="f-tout"${r.tout ? ' checked' : ''}><span>Afficher aussi les trains hors horaires</span></label></section>
<button class="principal" value="ok">Voir les trains</button>
</form>`;
  }

  function joursDuWeekend() {
    return JOURS.map((j) => ({ ...j, date: ajouterJours(etat.vendredi, j.decalage) }));
  }

  function render() {
    const jours = joursDuWeekend();
    etat.cache = new Map();
    etat.combo = calculerCombo(jours);
    if (!etat.ouverts) etat.ouverts = new Set(jours.filter((j) => compteZero(j).length).map((j) => j.cle));
    document.getElementById('app').innerHTML = `${bandeau(jours)}<div class="corps">${suggestion()}${listeJours(jours)}${pied()}</div>`;
    const d = document.getElementById('filtres');
    if (d.open) d.innerHTML = contenuFiltres();
  }

  /* ---------- Interactions ---------- */

  function basculer(liste, ville) {
    const i = liste.indexOf(ville);
    if (i >= 0) {
      if (liste.length > 1) liste.splice(i, 1);
    } else {
      liste.push(ville);
    }
    liste.sort((a, b) => VILLES.indexOf(a) - VILLES.indexOf(b));
  }

  function appliquer() {
    sauverReglages();
    render();
  }

  function sensParDefaut() {
    return aujourdhui() >= ajouterJours(etat.vendredi, 2) ? 'retour' : 'aller';
  }

  function surClic(e) {
    const dialogue = document.getElementById('filtres');
    if (e.target === dialogue) {
      dialogue.close();
      return;
    }
    const b = e.target.closest('[data-action]');
    if (!b || b.disabled) return;
    const r = etat.reglages;
    const action = b.dataset.action;
    if (action === 'f-tout') return;
    if (action === 'jour') {
      e.preventDefault();
      const j = JOURS.find((x) => x.cle === b.dataset.jour);
      if (etat.ouverts.has(j.cle)) {
        etat.ouverts.delete(j.cle);
      } else {
        etat.ouverts.add(j.cle);
        etat.sens = j.sens;
      }
      render();
      return;
    }
    if (action === 'sens') {
      etat.sens = b.dataset.sens;
      render();
      return;
    }
    if (action === 'ville') {
      const s = etat.sens;
      basculer(r[s], b.dataset.ville);
      if (r.synchro) r[s === 'aller' ? 'retour' : 'aller'] = [...r[s]];
    } else if (action === 'f-aller') {
      basculer(r.aller, b.dataset.ville);
      if (r.synchro) r.retour = [...r.aller];
    } else if (action === 'f-retour') {
      basculer(r.retour, b.dataset.ville);
      r.synchro = r.retour.join() === r.aller.join();
    } else if (action === 'creneau') {
      const l = r.creneaux[b.dataset.jour];
      const i = l.indexOf(b.dataset.moment);
      if (i >= 0) l.splice(i, 1);
      else l.push(b.dataset.moment);
    } else if (action === 'tout') {
      r.tout = true;
    } else if (action === 'masquer') {
      r.tout = false;
    } else if (action === 'payants') {
      r.payants = !r.payants;
    } else if (action === 'precedent' || action === 'suivant') {
      const liste = weekends();
      const i = liste.indexOf(etat.vendredi) + (action === 'suivant' ? 1 : -1);
      if (i >= 0 && i < liste.length) {
        etat.vendredi = liste[i];
        etat.ouverts = null;
        etat.sens = sensParDefaut();
      }
    } else if (action === 'filtres') {
      dialogue.innerHTML = contenuFiltres();
      dialogue.showModal();
      return;
    } else {
      return;
    }
    appliquer();
  }

  async function charger(url) {
    const reponse = await fetch(url, { cache: 'no-store' });
    if (!reponse.ok) throw new Error(String(reponse.status));
    return reponse.json();
  }

  async function demarrer() {
    const app = document.getElementById('app');
    const [trains, ter] = await Promise.allSettled([charger('data/latest.json'), charger('data/ter.json')]);
    if (trains.status !== 'fulfilled') {
      app.innerHTML = '<p class="erreur">Impossible de charger les trains pour le moment. Réessaie dans quelques minutes.</p>';
      return;
    }
    etat.donnees = trains.value;
    etat.ter = ter.status === 'fulfilled' ? ter.value : null;
    const liste = weekends();
    const v = vendrediDe(aujourdhui());
    etat.vendredi = liste.includes(v) ? v : liste[0];
    etat.sens = sensParDefaut();
    render();
    app.addEventListener('click', surClic);
    const dialogue = document.getElementById('filtres');
    dialogue.addEventListener('click', surClic);
    dialogue.addEventListener('change', (e) => {
      if (e.target.dataset.action === 'f-tout') {
        etat.reglages.tout = e.target.checked;
        appliquer();
      }
    });
  }

  demarrer();
})();
