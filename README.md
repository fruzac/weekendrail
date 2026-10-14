# weekendrail

Suivi des TGV INOUI à 0€ avec l'abonnement MAX JEUNE, pour les weekends au départ de Paris.

## Ce que fait le repo

Chaque matin, une tâche GitHub Actions télécharge le jeu de données SNCF « Disponibilité à 30 jours de places MAX JEUNE et MAX SENIOR » (open data, mis à jour une fois par jour en début de matinée) et garde les trajets entre Paris et Grenoble, Lyon, Valence, Chambéry et Annecy, dans les deux sens.

Chaque relevé devient une photo datée dans `data/snapshots/`. Avec le temps, ces photos permettront de savoir quand chaque train passe à 0€.

## Les fichiers

- `collector/collect.py` : le relevé
- `.github/workflows/collecte.yml` : la planification (3 lancements par matin)
- `data/latest.json` : la dernière photo
- `data/snapshots/AAAA-MM-JJ.json` : l'historique, une photo par jour

Chaque photo contient la liste des trains (`date`, `train`, `sens`, `ville`, `depart`, `arrivee`, `zero`) et les `changements` depuis la photo précédente.

## Lancer un relevé à la main

Onglet **Actions**, puis **Collecte quotidienne**, puis **Run workflow**.

## Source

Données SNCF Open Data, jeu `tgvmax`, licence ODbL.
