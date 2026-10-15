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
  const DEBUT_AXE = 5;
  const FIN_AXE = 24;
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
    vue: 'frise',
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
    ouvrir: '<svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M8 7h9v9"/></svg>',
  };

  const etat = { reglages: chargerReglages(), donnees: null, ter: null, vendredi: null, combo: null };

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
      vue: ['frise', 'grille', 'rubans'].includes(lu.vue) ? lu.vue : DEFAUT.vue,
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
    const r = etat.reglages;
    return `<header class="bandeau">
<div class="entete"><span>${maj ? `SNCF · ${esc(maj)}` : 'SNCF'}</span><span>relevé ${esc(instant(d.releve))}</span></div>
<div class="titre">
<h1>${actuel ? 'Ton weekend' : 'Plus tard'}</h1>
<div class="navigation">
<button type="button" class="rond" data-action="precedent" aria-label="Weekend précédent"${i <= 0 ? ' disabled' : ''}>${ICONES.gauche}</button>
<span class="plage">${plage}</span>
<button type="button" class="rond" data-action="suivant" aria-label="Weekend suivant"${i >= liste.length - 1 ? ' disabled' : ''}>${ICONES.droite}</button>
</div>
</div>
<div class="destinations"><div class="puces defile">${puces(r.aller, 'aller')}</div><button type="button" class="bouton-filtres" data-action="filtres">${ICONES.reglages}Filtres</button></div>
</header>`;
  }

  function puces(liste, action) {
    return VILLES.map((v) => {
      const on = liste.includes(v);
      return `<button type="button" class="puce${on ? ' active' : ''}" aria-pressed="${on}" data-action="${action}" data-ville="${esc(v)}">${esc(v)}</button>`;
    }).join('');
  }

  function vues() {
    const v = etat.reglages.vue;
    const b = (cle, nom) => `<button type="button" data-action="vue" data-vue="${cle}" aria-pressed="${v === cle}" class="${v === cle ? 'active' : ''}">${nom}</button>`;
    return `<nav class="segments" aria-label="Vues">${b('frise', 'Frise')}${b('grille', 'Grille')}${b('rubans', 'Rubans')}</nav>`;
  }

  function suggestion() {
    const { meilleur, allers, retours } = etat.combo;
    if (meilleur) {
      const { a, r, sur } = meilleur;
      const ou = a.ville === r.ville ? `à ${esc(a.ville)}` : 'sur place';
      return `<section class="suggestion">
<div class="s-gauche"><span class="mono">suggestion</span><span class="s-combo">${jourCourt(a.date)} ${heure(a.depart)} · ${jourCourt(r.date)} ${heure(r.depart)}</span></div>
<div class="s-droite"><span class="s-heures">${Math.floor(sur / 60)} h</span><span class="mono">${ou}</span></div>
</section>`;
    }
    const n = (x, mot) => `${x} ${mot}${x > 1 ? 's' : ''}`;
    return `<section class="suggestion">
<div class="s-gauche"><span class="mono">pas encore de combo à 0€</span><span class="s-combo">${n(allers, 'aller')} · ${n(retours, 'retour')}</span></div>
</section>`;
  }

  function etiquettes(tr, changements, suggeres) {
    const tags = [];
    if (suggeres.has(tr.cle)) tags.push('<span class="etiquette suggere">suggéré</span>');
    const c = tr.type === 'direct' ? changements.get(tr.cle) : changements.get(cleTrain(tr.tgv));
    if (c && tr.zero && c.avant === false) tags.push('<span class="etiquette nouveau">nouveau</span>');
    return tags.length ? `<span class="etiquettes">${tags.join('')}</span>` : '';
  }

  function boutonPrendre(tr, parti) {
    if (parti) return '<span class="statut">parti</span>';
    const quoi = `${heure(tr.depart)} ${tr.sens === 'aller' ? `Paris → ${tr.ville}` : `${tr.ville} → Paris`}`;
    return `<a class="prendre" href="${esc(tr.lien)}" target="_blank" rel="noopener" aria-label="0€, ouvrir ${esc(quoi)} dans SNCF Connect">0€${ICONES.ouvrir}</a>`;
  }

  function rangeeDirecte(tr, changements, suggeres) {
    const t = tr.tgv;
    const parti = estParti(t.date, t.depart);
    const autre = tr.sens === 'aller' ? nomGare(t.destination) : nomGare(t.origine);
    const reste = autre.startsWith(`${tr.ville} `) ? autre.slice(tr.ville.length + 1) : autre;
    const precision = autre !== tr.ville ? esc(reste) : 'direct';
    const arrivee = tr.sens === 'aller' ? `arr. ${heure(t.arrivee)}` : `arr. Paris ${heure(t.arrivee)}`;
    const classes = ['rangee', suggeres.has(tr.cle) ? 'suggere' : '', parti ? 'parti' : ''].filter(Boolean).join(' ');
    return `<article class="${classes}">
<span class="heure">${heure(t.depart)}</span>
<div class="infos">${etiquettes(tr, changements, suggeres)}<span class="trajet">${esc(tr.ville)} <span class="discret">${precision}</span></span><span class="meta">${arrivee} · ${enDuree(dureeMinutes(t))} · n°${esc(t.train)}</span></div>
${boutonPrendre(tr, parti)}
</article>`;
  }

  function rangeeVia(tr, changements, suggeres) {
    const t = tr.tgv;
    const parti = estParti(tr.date, tr.depart);
    const nom = NOM_NOEUD[tr.noeud];
    const ter = tr.ter.car ? 'Car' : 'TER';
    const etapeTgv = tr.sens === 'aller'
      ? `<div class="etape tgv"><b>TGV</b><span>jusqu'à ${esc(nom)}, ${heure(t.arrivee)}</span><span class="prix">0€</span></div>`
      : `<div class="etape tgv"><b>TGV</b><span>${heure(t.depart)}, arr. Paris ${heure(t.arrivee)}</span><span class="prix">0€</span></div>`;
    const etapeTer = tr.sens === 'aller'
      ? `<div class="etape ter"><b>${ter}</b><span>${heure(tr.ter.depart)}, arr. ${heure(tr.ter.arrivee)}</span></div>`
      : `<div class="etape ter"><b>${ter}</b><span>jusqu'à ${esc(nom)}, ${heure(tr.ter.arrivee)}</span></div>`;
    const arrivee = tr.sens === 'aller' ? `arr. ${heure(tr.ter.arrivee)}` : `arr. Paris ${heure(t.arrivee)}`;
    const classes = ['rangee', 'via', suggeres.has(tr.cle) ? 'suggere' : '', parti ? 'parti' : ''].filter(Boolean).join(' ');
    return `<article class="${classes}">
<span class="heure">${heure(tr.depart)}</span>
<div class="infos">${etiquettes(tr, changements, suggeres)}<span class="trajet">${esc(tr.ville)} <span class="discret">via ${esc(NOM_VIA[tr.noeud])}</span></span><span class="meta">${arrivee} · ${enDuree(tr.fin - tr.debut)}</span>
<div class="etapes">${tr.sens === 'aller' ? etapeTgv + etapeTer : etapeTer + etapeTgv}</div></div>
${boutonPrendre(tr, parti)}
</article>`;
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

  function blocJour(j, changements, suggeres) {
    const tous = trajetsDuJour(j);
    const visibles = tous.filter((tr) => dansCreneau(j, tr.depart));
    const zero = visibles.filter((tr) => tr.zero);
    const payants = visibles.filter((tr) => !tr.zero);
    const zeroHors = tous.filter((tr) => tr.zero && !dansCreneau(j, tr.depart)).length;
    const rangees = zero.map((tr) => (tr.type === 'via' ? rangeeVia(tr, changements, suggeres) : rangeeDirecte(tr, changements, suggeres))).join('');
    const vide = zero.length ? '' : '<p class="vide">Rien à 0€ sur tes créneaux pour l\'instant.</p>';
    let bas = '';
    if (payants.length) {
      bas = etat.reglages.payants
        ? `<div class="payants"><span class="mono discret">payants</span>${lignesPayants(payants)}</div>`
        : `<button type="button" class="pied-bloc" data-action="payants">${payants.length} payant${payants.length > 1 ? 's' : ''} sur tes créneaux</button>`;
    }
    const hors = zeroHors && !etat.reglages.tout
      ? `<button type="button" class="pied-bloc vert" data-action="tout">+ ${zeroHors} à 0€ hors créneaux</button>`
      : '';
    const compte = zero.filter((tr) => !estParti(tr.date, tr.depart)).length;
    return `<section class="bloc" aria-label="${j.nom} ${jourDuMois(j.date)}">
<div class="bloc-tete"><h2>${j.nom} ${jourDuMois(j.date)}</h2><span class="mono discret">${j.sens}</span><span class="compte${compte ? '' : ' nul'}">${compte} à 0€</span></div>
${rangees}${vide}${bas}${hors}
</section>`;
  }

  function frise(jours) {
    const changements = indexChangements();
    const m = etat.combo.meilleur;
    const suggeres = new Set(m ? [m.a.cle, m.r.cle] : []);
    const p = etat.reglages.payants;
    const bascule = `<div class="segments petit" role="group" aria-label="Affichage">
<button type="button" data-action="essentiel" aria-pressed="${!p}" class="${p ? '' : 'active'}">Essentiel</button>
<button type="button" data-action="payants" aria-pressed="${p}" class="${p ? 'active' : ''}">Avec les payants</button>
</div>`;
    const masquer = etat.reglages.tout
      ? '<button type="button" class="lien" data-action="masquer">revenir à mes créneaux</button>'
      : '';
    return `${bascule}${masquer}${jours.map((j) => blocJour(j, changements, suggeres)).join('')}`;
  }

  function pastille(t) {
    const plusieurs = villesPour(t.sens).length > 1;
    return `<div class="pastille${t.zero ? ' zero' : ''}${estParti(t.date, t.depart) ? ' parti' : ''}"><span class="p-haut"><span>${heure(t.depart)}</span>${t.zero ? '<span>0€</span>' : ''}</span>${plusieurs ? `<span class="p-bas">${esc(t.ville)}</span>` : ''}</div>`;
  }

  function grille(jours) {
    const entetes = jours.map((j) => `<div class="g-entete"><b>${j.court} ${jourDuMois(j.date)}</b><span>${j.sens}</span></div>`).join('');
    const lignes = MOMENTS.map((m) => {
      const cellules = jours.map((j) => {
        const trains = trainsDuJour(j).filter((t) => moment(t.depart) === m.cle);
        const hors = !etat.reglages.tout && !creneauxDe(j).includes(m.cle);
        if (hors) {
          const z = trains.filter((t) => t.zero && !estParti(t.date, t.depart)).length;
          return `<div class="g-cellule hors"><span>hors créneau</span>${z ? `<b>${z} à 0€</b>` : ''}</div>`;
        }
        if (!trains.length) return '<div class="g-cellule sans">aucun</div>';
        return `<div class="g-cellule">${trains.map(pastille).join('')}</div>`;
      }).join('');
      return `<div class="g-moment"><b>${m.nom}</b><span>${m.aide}</span></div>${cellules}`;
    }).join('');
    return `<section class="bloc grille">
<div class="g-titre"><span>D'un coup d'œil</span><span class="mono discret">trains directs</span></div>
<div class="g-table"><span></span>${entetes}${lignes}</div>
</section>`;
  }

  const pourcent = (h) => ((Math.min(Math.max(h, DEBUT_AXE), FIN_AXE) - DEBUT_AXE) / (FIN_AXE - DEBUT_AXE)) * 100;

  function rubans(jours) {
    const graduations = [6, 9, 12, 15, 18, 21, 24].map((h) => `<span style="left:${pourcent(h)}%">${h}h</span>`).join('');
    const traits = [6, 9, 12, 15, 18, 21].map((h) => `<span class="r-trait" style="left:${pourcent(h)}%"></span>`).join('');
    const blocs = jours.map((j) => {
      const trains = trainsDuJour(j).slice().sort((a, b) => minutes(a.depart) - minutes(b.depart));
      const voies = [];
      const barres = trains.map((t) => {
        const debut = minutes(t.depart) / 60;
        const fin = debut + dureeMinutes(t) / 60;
        let v = voies.findIndex((f) => f <= debut);
        if (v === -1) {
          v = voies.length;
          voies.push(fin);
        } else {
          voies[v] = fin;
        }
        const gauche = pourcent(debut);
        const largeur = Math.max(pourcent(fin) - gauche, 7);
        return `<div class="barre${t.zero ? ' zero' : ''}${estParti(t.date, t.depart) ? ' parti' : ''}" style="left:${gauche}%;width:${largeur}%;top:${v * 34}px"><span>${heure(t.depart)}</span><span>${t.zero ? '0€' : ''}</span></div>`;
      }).join('');
      const hauteur = Math.max(voies.length, 1) * 34 - 4;
      const bandes = creneauxDe(j).map((m) => {
        const [a, b] = BORNES[m];
        const g = pourcent(a);
        return `<span class="r-bande" style="left:${g}%;width:${pourcent(b) - g}%"></span>`;
      }).join('');
      return `<div class="r-jour"><b>${j.nom} ${jourDuMois(j.date)}</b><span class="mono discret">${j.sens}</span></div>
<div class="r-voie" style="height:${hauteur}px">${bandes}${traits}${barres}${trains.length ? '' : '<span class="r-vide">aucun train</span>'}</div>`;
    }).join('');
    return `<section class="bloc rubans">
<div class="g-titre"><span>Heure par heure</span><span class="mono discret">trains directs</span></div>
<div class="r-axe">${graduations}</div>
${blocs}
<div class="r-legende mono discret"><span><i class="l-zero"></i>0€</span><span><i class="l-payant"></i>payant</span><span><i class="l-bande"></i>tes créneaux</span></div>
</section>`;
  }

  function pied() {
    const ter = etat.ter && etat.ter.genere ? ` Horaires TER du ${esc(instant(etat.ter.genere))}.` : '';
    return `<footer class="pied mono discret">Open data SNCF, mis à jour une fois par jour : vérifie sur SNCF Connect avant de réserver.${ter}</footer>`;
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
<section class="f-bloc"><h3>Créneaux</h3><div class="f-creneaux">${creneaux}</div>
<label class="interrupteur"><input type="checkbox" data-action="f-tout"${r.tout ? ' checked' : ''}><span>Afficher aussi les trains hors créneaux</span></label></section>
<button class="principal" value="ok">Voir les trains</button>
</form>`;
  }

  function joursDuWeekend() {
    return JOURS.map((j) => ({ ...j, date: ajouterJours(etat.vendredi, j.decalage) }));
  }

  function render() {
    const jours = joursDuWeekend();
    etat.combo = calculerCombo(jours);
    const v = etat.reglages.vue;
    const contenu = v === 'grille' ? grille(jours) : v === 'rubans' ? rubans(jours) : frise(jours);
    document.getElementById('app').innerHTML = `${bandeau(jours)}<div class="corps">${suggestion()}${vues()}${contenu}${pied()}</div>`;
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
    if (action === 'aller' || action === 'f-aller') {
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
      r.payants = true;
    } else if (action === 'essentiel') {
      r.payants = false;
    } else if (action === 'vue') {
      r.vue = b.dataset.vue;
    } else if (action === 'precedent' || action === 'suivant') {
      const liste = weekends();
      const i = liste.indexOf(etat.vendredi) + (action === 'suivant' ? 1 : -1);
      if (i >= 0 && i < liste.length) etat.vendredi = liste[i];
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
