# weekendrail

Suivi des TGV INOUI à 0€ avec l'abonnement MAX JEUNE, pour les weekends au départ de Paris.

## Ce que fait le repo

Chaque matin autour de la publication SNCF, puis à midi et en fin de journée, une tâche GitHub Actions télécharge le jeu de données SNCF « Disponibilité à 30 jours de places MAX JEUNE et MAX SENIOR » (open data, mis à jour une fois par jour en début de matinée) et garde les trajets entre Paris et Grenoble, Lyon, Valence, Chambéry et Annecy, dans les deux sens.

Chaque relevé devient une photo datée dans `data/snapshots/`. Avec le temps, ces photos permettront de savoir quand chaque train passe à 0€.

## Les fichiers

- `collector/collect.py` : le relevé des places MAX
- `collector/stats.py` : la chance qu'un train payant passe à 0€, calculée sur les photos passées (publiée à partir de 4 départs observés)
- `collector/ter.py` : les horaires TER utiles aux correspondances (Lyon, Valence, Chambéry vers Grenoble et Saint Marcellin), tirés du GTFS SNCF
- `.github/workflows/collecte.yml` : la planification des relevés MAX (5 lancements par jour, un enregistrement seulement si les données ont changé)
- `.github/workflows/horaires-ter.yml` : les horaires TER, une fois par jour
- `data/latest.json` : la dernière photo
- `data/snapshots/AAAA-MM-JJ.json` : l'historique, une photo par jour
- `data/ter.json` : les TER des 35 prochains jours
- `data/stats.json` : les pourcentages par train
- `index.html`, `assets/` : le site (GitHub Pages)

Chaque photo contient la liste des trains (`date`, `train`, `sens`, `ville`, `depart`, `arrivee`, `zero`) et les `changements` depuis la photo précédente.

## Lancer un relevé à la main

Onglet **Actions**, puis **Collecte quotidienne**, puis **Run workflow**.

## Source

Données SNCF Open Data : jeu `tgvmax` et horaires théoriques GTFS, licence ODbL.
