# CircuitHub frontend payloads

Base URL: `http://localhost:8000`

Searches open real vendor pages and often take one to two minutes. Keep the request open until the JSON returns. On failure the body is `{ "detail": "message" }`.

## Price search

`POST /api/prices/search`

```json
{
  "query": "LM324",
  "sites": null,
  "origin_url": null
}
```

`sites` is an optional list of vendor domains, for example `["leedscart.com"]`. Omit it to search every configured vendor.

```json
{
  "query": "LM324",
  "origin": null,
  "offers": [
    {
      "title": "LM324",
      "link": "https://www.example.com/product",
      "vendor": "robu.in",
      "price_raw": "₹25",
      "price": 25,
      "currency": "INR",
      "normalized_price_inr": 25,
      "details": "LM324 quad op amp SOIC"
    }
  ]
}
```

The price agent has no package field. Filter `title` and `details` in the browser with the manufacturer, package, and note the user typed.

## Datasheet search

`POST /api/datasheets/search`

```json
{
  "query": "LM324",
  "manufacturer": "ST",
  "package": "SOIC",
  "smd": false
}
```

Set `smd` to `true` when the query is a marking code such as `EN`. `manufacturer` and `package` are optional and narrow the hits on the server.

```json
{
  "query": "LM324",
  "smd": false,
  "needs_confirmation": true,
  "candidates": [
    {
      "title": "LM324",
      "mpn": "LM324",
      "manufacturer": "Stmicroelectronics",
      "package": "SO14",
      "description": "Quad operational amplifier",
      "source": "datasheets.com",
      "page_url": "https://www.datasheets.com/stmicroelectronics/lm324",
      "pdf_url": "https://static.datasheets.com/doc/example.pdf",
      "smd_code": null,
      "saved_path": null
    }
  ]
}
```

When `needs_confirmation` is true, show the candidates and let the user pick one. When it is false and one candidate remains, download that row.

## Download

`POST /api/datasheets/download`

Send the chosen candidate. `title` and `source` are required. Include `pdf_url` or `page_url` so the server can fetch the file.

```json
{
  "title": "LM324",
  "mpn": "LM324",
  "manufacturer": "Stmicroelectronics",
  "package": "SO14",
  "description": "Quad operational amplifier",
  "source": "datasheets.com",
  "page_url": "https://www.datasheets.com/stmicroelectronics/lm324",
  "pdf_url": "https://static.datasheets.com/doc/example.pdf",
  "smd_code": null
}
```

The response is the same object with `saved_path` set, for example `datasheets\\LM324.pdf`. Use only the file name in the viewer URL.

## Open the PDF

`GET /api/datasheets/file/{filename}`

Example: `http://localhost:8000/api/datasheets/file/LM324.pdf`

The response is `application/pdf`. Put that URL in an iframe. The name must be a single `.pdf` file inside the server `datasheets` folder. Paths such as `../` are rejected.

CORS allows `http://localhost:3000`, `http://127.0.0.1:3000`, `http://localhost:5173`, and `http://127.0.0.1:5173`.
