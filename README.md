# SANTEX — Sistema de gestão

Calculadora de orçamentos para serviços de topografia e georreferenciamento (rural e urbano).
Responsável técnico: Clessiano Antunes (TRT/CFT).

Site: https://santexgeo.github.io/gestao/

## Funções
- **Mapa com satélite**: desenhar a poligonal da área, importar KML/KMZ (CAR, SIGEF, Google Earth), usar o GPS do celular
- **Área, perímetro e vértices** calculados a partir da poligonal
- **Base fixa** (Águas Vermelhas - MG) e **rota automática** pelas estradas, separando asfalto e terra
- **Combustível** (gasolina) com preço e data da última atualização
- Custos de deslocamento, equipe, equipamentos (2 RTK + drone), escritório, marcos, TRT, impostos e margem
- Valor mínimo: R$ 3.000 rural / R$ 1.200 urbano
- Proposta em PDF com logotipo e croqui da área

## Instalar como app
No Chrome (PC ou Android), abra o site e clique em **⬇ Instalar app** no topo, ou no menu ⋮ → **Instalar app** / **Adicionar à tela inicial**.

## Serviços externos usados (gratuitos, sem chave)
- Imagens de satélite: Esri World Imagery
- Rotas: OSRM (router.project-osrm.org)
- Busca de lugares: Nominatim / OpenStreetMap

## Módulos

- **Painel**: faturamento, recebimentos, despesas, lucro, alertas, serviços em andamento, indicadores comerciais e revisão anual de valores.
- **Novo orçamento / Orçamentos**: cálculo com mapa e rota, numeração 001/2026 com revisões, taxas de terceiros detalhadas, divisão do deslocamento, análise de relevo, proposta em PDF e envio pelo WhatsApp.
- **Serviços**: etapas (campo → escritório → SIGEF → certificado → cartório), parcelas a receber, pagamentos com recibo, prestadores, despesas e contrato em PDF.
- **Cadastros**: clientes (com histórico) e prestadores (com diárias pagas e recibos).
- **Despesas, Sócios, Relatório**: compras parceladas no cartão, divisão do lucro e demonstrativo mensal/anual.
