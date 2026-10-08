# iBuild Obras — Acompanhamento de Obra

Site estático (HTML/CSS/JS puro) hospedado no GitHub Pages para orçamentos de obra com:

- Múltiplos orçamentos salvos no navegador (localStorage)
- EAP em 4 níveis: Unidade Construtiva → Etapa → Sub Etapa → Serviço
- Colunas: EAP, descrição, quantidade, unidade, valor unitário, valor total
- Memória de cálculo por serviço (soma automática das quantidades)
- Subtotais por sub etapa, etapa e unidade construtiva
- Exportar / importar backup JSON (compartilhamento via OneDrive/SharePoint)

## Publicar no GitHub Pages

1. Crie um repositório no GitHub (ex.: `ibuild-obras`)
2. Envie os arquivos: `index.html`, pasta `css/` e pasta `js/`
3. No repositório: **Settings → Pages → Source: Deploy from a branch → main / root → Save**
4. Acesse `https://SEUUSUARIO.github.io/ibuild-obras/`

## Fluxo de backup com a equipe (Microsoft 365)

- "Exportar backup" gera um arquivo `.json`
- Guarde em uma pasta compartilhada do OneDrive/SharePoint
- A equipe abre o site e usa "Importar backup" para carregar a versão mais recente
