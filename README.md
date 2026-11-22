# SANTEX — Sistema de Orçamentos

Calculadora de orçamentos para serviços de topografia e georreferenciamento (rural e urbano).
Responsável técnico: Clessiano Antunes (TRT/CFT).

Site: https://clarkve12.github.io/orcamento-topografia/

## Funções
- **Mapa com satélite**: desenhar a poligonal da área, importar KML/KMZ (CAR, SIGEF, Google Earth), usar o GPS do celular
- **Área, perímetro e vértices** calculados a partir da poligonal
- **Base fixa** (Águas Vermelhas - MG) e **rota automática** pelas estradas, separando asfalto e terra
- **Combustível** com preço do Posto Ingazeira e data da última atualização
- Custos de deslocamento, equipe, equipamentos (2 RTK + drone), escritório, marcos, TRT, impostos e margem
- Valor mínimo: R$ 3.000 rural / R$ 1.200 urbano
- Proposta em PDF com logotipo e croqui da área

## Serviços externos usados (gratuitos, sem chave)
- Imagens de satélite: Esri World Imagery
- Rotas: OSRM (router.project-osrm.org)
- Busca de lugares: Nominatim / OpenStreetMap
