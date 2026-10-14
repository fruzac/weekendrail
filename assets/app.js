(() => {
  'use strict';

  const VILLES = ['Grenoble', 'Lyon', 'Valence', 'Chambéry', 'Annecy'];
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
    'LYON ST EXUPERY TGV.': 'Lyon St Exupéry',
    'VALENCE TGV AUVERGNE RHONE ALPES': 'Valence TGV',
    'VALENCE VILLE': 'Valence Ville',
    'CHAMBERY CHALLES LES EAUX': 'Chambéry',
    'GRENOBLE': 'Grenoble',
    'ANNECY': 'Annecy',
  };
  const DEFAUT = {
    aller: ['Grenoble'],
    retour: ['Grenoble'],
    synchro: true,
    vue: 'frise',
    tout: false,
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
  };

  const etat = { reglages: chargerReglages(), donnees: null, vendredi: null, combo: null };

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
  const heure = (hhmm) => {
    const [h, m] = hhmm.split(':');
    return `${Number(h)}h${m}`;
  };
  const moment = (hhmm) => {
    const h = Number(hhmm.slice(0, 2));
    return h < 12 ? 'matin' : h < 18 ? 'aprem' : 'soir';
  };
  function dureeMinutes(t) {
    let d = minutes(t.arrivee) - minutes(t.depart);
    if (d < 0) d += 1440;
    return d;
  }
  const duree = (t) => {
    const d = dureeMinutes(t);
    return `${Math.floor(d / 60)}h${String(d % 60).padStart(2, '0')}`;
  };
  const absolu = (iso, hhmm) => Math.round(versDate(iso).getTime() / 60000) + minutes(hhmm);
  const arriveeAbsolue = (t) => absolu(t.date, t.depart) + dureeMinutes(t);

  function instant(texte) {
    if (!texte) return '';
    const d = new Date(texte);
    if (Number.isNaN(d.getTime())) return '';
    const p = Object.fromEntries(fmtInstant.formatToParts(d).map((x) => [x.type, x.value]));
    return `${Number(p.day)} ${MOIS_COURT[Number(p.month) - 1]} à ${Number(p.hour)}h${p.minute}`;
  }

  function estParti(t) {
    const auj = aujourdhui();
    return t.date < auj || (t.date === auj && minutes(t.depart) < minutesMaintenant());
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
  const dansCreneau = (jour, t) => etat.reglages.tout || creneauxDe(jour).includes(moment(t.depart));

  function trainsDuJour(jour) {
    const villes = villesPour(jour.sens);
    return etat.donnees.trains.filter((t) => t.date === jour.date && t.sens === jour.sens && villes.includes(t.ville));
  }

  function indexChangements() {
    const m = new Map();
    for (const c of etat.donnees.changements || []) m.set(cleTrain(c), c);
    return m;
  }

  function calculerCombo(jours) {
    const disponibles = (j) => trainsDuJour(j).filter((t) => dansCreneau(j, t) && t.zero && !estParti(t));
    const allers = jours.filter((j) => j.sens === 'aller').flatMap(disponibles);
    const retours = jours.filter((j) => j.sens === 'retour').flatMap(disponibles);
    let meilleur = null;
    for (const a of allers) {
      for (const r of retours) {
        const sur = absolu(r.date, r.depart) - arriveeAbsolue(a);
        if (sur > 0 && (!meilleur || sur > meilleur.sur)) meilleur = { a, r, sur };
      }
    }
    return { meilleur, allers: allers.length, retours: retours.length };
  }

  /* ---------- Affichage ---------- */

  function entete() {
    const d = etat.donnees;
    const maj = instant(d.maj_sncf);
    return `<header class="entete"><span>${maj ? `données SNCF du ${esc(maj)}` : 'données SNCF'}</span><span>relevé ${esc(instant(d.releve))}</span></header>`;
  }

  function titre(jours) {
    const liste = weekends();
    const i = liste.indexOf(etat.vendredi);
    const debut = versDate(jours[0].date);
    const fin = versDate(jours[3].date);
    const plage = debut.getUTCMonth() === fin.getUTCMonth()
      ? `vendredi ${debut.getUTCDate()} → lundi ${fin.getUTCDate()} ${MOIS[fin.getUTCMonth()]}`
      : `vendredi ${debut.getUTCDate()} ${MOIS[debut.getUTCMonth()]} → lundi ${fin.getUTCDate()} ${MOIS[fin.getUTCMonth()]}`;
    const actuel = etat.vendredi === vendrediDe(aujourdhui());
    return `<div class="titre">
<h1>${actuel ? 'Ton weekend' : 'Plus tard'}</h1>
<div class="navigation">
<button type="button" class="rond" data-action="precedent" aria-label="Weekend précédent"${i <= 0 ? ' disabled' : ''}>${ICONES.gauche}</button>
<span class="plage">${plage}</span>
<button type="button" class="rond" data-action="suivant" aria-label="Weekend suivant"${i >= liste.length - 1 ? ' disabled' : ''}>${ICONES.droite}</button>
</div>
</div>`;
  }

  function puces(liste, action) {
    return VILLES.map((v) => {
      const on = liste.includes(v);
      return `<button type="button" class="puce${on ? ' active' : ''}" aria-pressed="${on}" data-action="${action}" data-ville="${esc(v)}">${esc(v)}</button>`;
    }).join('');
  }

  function filtresRapides() {
    const r = etat.reglages;
    const retour = r.synchro ? 'retour depuis les mêmes villes' : `retour depuis ${r.retour.join(', ')}`;
    return `<section class="verre filtres-rapides" aria-label="Filtres rapides">
<div class="ligne"><span class="mono">aller vers · ${esc(retour)}</span><button type="button" class="bouton-filtres" data-action="filtres">${ICONES.reglages}Filtres</button></div>
<div class="puces defile">${puces(r.aller, 'aller')}</div>
</section>`;
  }

  function vues() {
    const v = etat.reglages.vue;
    const b = (cle, nom) => `<button type="button" data-action="vue" data-vue="${cle}" aria-pressed="${v === cle}" class="${v === cle ? 'active' : ''}">${nom}</button>`;
    return `<nav class="verre vues" aria-label="Vues">${b('frise', 'Frise')}${b('grille', 'Grille')}${b('rubans', 'Rubans')}</nav>`;
  }

  function suggestion() {
    const { meilleur, allers, retours } = etat.combo;
    if (meilleur) {
      const { a, r, sur } = meilleur;
      return `<section class="verre carte-suggestion">
<span class="mono discret">suggestion du moment</span>
<div class="combo">${jourCourt(a.date)} ${heure(a.depart)} · ${jourCourt(r.date)} ${heure(r.depart)}</div>
<div class="sur-place"><span class="grand vert">${Math.floor(sur / 60)} h</span><span>sur place</span></div>
<p class="discret">${esc(nomGare(a.origine))} → ${esc(nomGare(a.destination))}, puis ${esc(nomGare(r.origine))} → ${esc(nomGare(r.destination))}. Les deux sont à 0€.</p>
</section>`;
    }
    const s = (n, mot) => `<span><b>${n}</b>${mot}${n > 1 ? 's' : ''} à 0€</span>`;
    return `<section class="verre carte-suggestion">
<span class="mono discret">pas encore de combo à 0€</span>
<div class="compte">${s(allers, 'aller')}${s(retours, 'retour')}</div>
<p class="discret">Sur tes créneaux. La SNCF ajoute des places MAX jusqu'à deux jours avant le départ, et les relevés continuent plusieurs fois par jour.</p>
</section>`;
  }

  function carteTrain(t, changements, suggeres) {
    const cle = cleTrain(t);
    const c = changements.get(cle);
    const parti = estParti(t);
    const suggere = suggeres.has(cle);
    const tags = [];
    if (suggere) tags.push('<span class="etiquette suggere">suggéré</span>');
    if (c && t.zero && c.avant !== true) tags.push('<span class="etiquette nouveau">nouveau</span>');
    if (c && !t.zero && c.avant === true) tags.push('<span class="etiquette perdu">plus à 0€</span>');
    const classes = ['train', t.zero ? 'zero' : 'payant', suggere ? 'suggere' : '', parti ? 'parti' : ''].filter(Boolean).join(' ');
    const statut = parti
      ? '<span class="statut">parti</span>'
      : t.zero ? '<span class="statut zero">0€</span>' : '<span class="statut">payant</span>';
    return `<article class="${classes}">
<span class="noeud" aria-hidden="true"></span>
<span class="heure">${heure(t.depart)}</span>
<div class="infos">${tags.length ? `<span class="etiquettes">${tags.join('')}</span>` : ''}<span class="trajet">${esc(nomGare(t.origine))} → ${esc(nomGare(t.destination))}</span><span class="meta">arr. ${heure(t.arrivee)} · ${duree(t)} · n°${esc(t.train)}</span></div>
${statut}
</article>`;
  }

  function frise(jours) {
    const changements = indexChangements();
    const m = etat.combo.meilleur;
    const suggeres = new Set(m ? [cleTrain(m.a), cleTrain(m.r)] : []);
    const blocs = jours.map((j) => {
      const tous = trainsDuJour(j);
      const visibles = tous.filter((t) => dansCreneau(j, t));
      const caches = tous.length - visibles.length;
      const cartes = visibles.map((t) => carteTrain(t, changements, suggeres)).join('');
      const vide = visibles.length ? '' : '<p class="vide">Aucun train sur tes créneaux.</p>';
      const plus = caches > 0
        ? `<button type="button" class="lien" data-action="tout">voir ${caches} train${caches > 1 ? 's' : ''} hors créneaux</button>`
        : '';
      return `<div class="jour"><span class="noeud-jour" aria-hidden="true"></span><h2>${j.nom} ${jourDuMois(j.date)}</h2><span class="mono discret">${j.sens}</span></div>${cartes}${vide}${plus}`;
    }).join('');
    const masquer = etat.reglages.tout
      ? '<button type="button" class="lien" data-action="masquer">masquer les trains hors créneaux</button>'
      : '';
    return `${masquer}<section class="frise">${blocs}</section>`;
  }

  function pastille(t) {
    const plusieurs = villesPour(t.sens).length > 1;
    return `<div class="pastille${t.zero ? ' zero' : ''}${estParti(t) ? ' parti' : ''}"><span class="p-haut"><span>${heure(t.depart)}</span>${t.zero ? '<span>0€</span>' : ''}</span>${plusieurs ? `<span class="p-bas">${esc(t.ville)}</span>` : ''}</div>`;
  }

  function grille(jours) {
    const entetes = jours.map((j) => `<div class="g-entete"><b>${j.court} ${jourDuMois(j.date)}</b><span>${j.sens}</span></div>`).join('');
    const lignes = MOMENTS.map((m) => {
      const cellules = jours.map((j) => {
        const trains = trainsDuJour(j).filter((t) => moment(t.depart) === m.cle);
        const hors = !etat.reglages.tout && !creneauxDe(j).includes(m.cle);
        if (hors) {
          const z = trains.filter((t) => t.zero && !estParti(t)).length;
          return `<div class="g-cellule hors"><span>hors créneau</span>${z ? `<b>${z} à 0€</b>` : ''}</div>`;
        }
        if (!trains.length) return '<div class="g-cellule sans">aucun</div>';
        return `<div class="g-cellule">${trains.map(pastille).join('')}</div>`;
      }).join('');
      return `<div class="g-moment"><b>${m.nom}</b><span>${m.aide}</span></div>${cellules}`;
    }).join('');
    return `<section class="verre grille">
<div class="g-titre"><span>D'un coup d'œil</span><span class="mono discret">jours × moments</span></div>
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
        return `<div class="barre${t.zero ? ' zero' : ''}${estParti(t) ? ' parti' : ''}" style="left:${gauche}%;width:${largeur}%;top:${v * 34}px"><span>${heure(t.depart)}</span><span>${t.zero ? '0€' : ''}</span></div>`;
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
    return `<section class="verre rubans">
<div class="g-titre"><span>Heure par heure</span><span class="mono discret">départ → arrivée</span></div>
<div class="r-axe">${graduations}</div>
${blocs}
<div class="r-legende mono discret"><span><i class="l-zero"></i>0€</span><span><i class="l-payant"></i>payant</span><span><i class="l-bande"></i>tes créneaux</span></div>
</section>`;
  }

  function pied() {
    return '<footer class="pied mono discret">Source : open data SNCF, jeu tgvmax. Les pourcentages de chances arriveront quand l\'historique sera assez long.</footer>';
  }

  function contenuFiltres() {
    const r = etat.reglages;
    const creneaux = JOURS.map((j) => `<span class="f-jour">${j.court}</span>${MOMENTS.map((m) => {
      const on = creneauxDe(j).includes(m.cle);
      return `<button type="button" class="case${on ? ' active' : ''}" aria-pressed="${on}" data-action="creneau" data-jour="${j.cle}" data-moment="${m.cle}">${m.nom.toLowerCase()}</button>`;
    }).join('')}`).join('');
    return `<form method="dialog" class="f-contenu">
<div class="f-tete"><h2>Filtres</h2><button class="bouton-filtres" value="ok">Fermer</button></div>
<section class="verre f-bloc"><h3>Aller vers</h3><div class="puces">${puces(r.aller, 'f-aller')}</div></section>
<section class="verre f-bloc"><h3>Retour depuis</h3><div class="puces">${puces(r.retour, 'f-retour')}</div><p>Différent de l'aller quand tu enchaînes deux villes. Saint Marcellin arrivera avec les correspondances TER.</p></section>
<section class="verre f-bloc"><h3>Créneaux</h3><div class="f-creneaux">${creneaux}</div>
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
    document.getElementById('app').innerHTML = entete() + titre(jours) + filtresRapides() + vues() + suggestion() + contenu + pied();
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

  async function demarrer() {
    const app = document.getElementById('app');
    try {
      const reponse = await fetch('data/latest.json', { cache: 'no-store' });
      if (!reponse.ok) throw new Error(String(reponse.status));
      etat.donnees = await reponse.json();
    } catch (e) {
      app.innerHTML = '<p class="erreur">Impossible de charger les trains pour le moment. Réessaie dans quelques minutes.</p>';
      return;
    }
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
