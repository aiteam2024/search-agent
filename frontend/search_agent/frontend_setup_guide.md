# CircuitHub Frontend Setup Guide

This guide documents the real JSON request/response payloads, endpoint schemas, and frontend-backend architecture for CircuitHub.

---

## 1. Backend Service Configuration

- **Default Base URL**: `http://localhost:8000`
- **Supported Frontend Ports (CORS)**:
  - `http://localhost:3000`
  - `http://127.0.0.1:3000`
  - `http://localhost:5173`
  - `http://127.0.0.1:5173`

> **Note on Latency**: Searches launch headless Camoufox browser workers to scrape live vendor inventory and can take 1 to 2 minutes. The frontend keeps the connection open with abort signal support and displays an elapsed timer with progress indication.

---

## 2. API Endpoints & Real Payloads

### A. Price Search

**Endpoint**: `POST /api/prices/search`  
**Description**: Scrapes vendor pages (e.g., Robu.in, LeedsCart, Mouser, ElectronicsComp) for live stock and prices.

#### Request Body:
```json
{
  "query": "LM324",
  "sites": null,
  "origin_url": null
}
```
*Note: `sites` is an optional array of vendor domains (e.g. `["leedscart.com"]`). Omit or pass `null` to search every configured vendor. For SMD marking codes (e.g. "A7"), pass the marking code as `query`.*

#### Success Response:
```json
{
  "query": "LM324",
  "origin": null,
  "offers": [
    {
      "title": "LM324 Quad Operational Amplifier (SOIC-14)",
      "link": "https://robu.in/product/lm324-quad-opamp-soic14",
      "vendor": "robu.in",
      "price_raw": "₹18.50",
      "price": 18.5,
      "currency": "INR",
      "normalized_price_inr": 18.5,
      "details": "Texas Instruments LM324DR Quad Low-Power Op-Amp, SOIC-14 package, surface mount, 3V-32V"
    }
  ]
}
```

#### Client-side Filtering Rule:
The price scraper does not have a separate package field. The browser filters `title` and `details` using the manufacturer, package (e.g. `SOIC`, `SOT-23`), and note fields. Offers are automatically sorted by `normalized_price_inr` ascending, with the lowest priced offer marked as "Cheapest".

---

### B. Datasheet Search

**Endpoint**: `POST /api/datasheets/search`  
**Description**: Searches datasheet repositories (Datasheets.com, Alldatasheet, manufacturer portals).

#### Request Body (Standard Component):
```json
{
  "query": "LM324",
  "manufacturer": "ST",
  "package": "SOIC",
  "smd": false
}
```

#### Request Body (SMD Marking Code):
```json
{
  "query": "A7",
  "manufacturer": null,
  "package": "SOT-23",
  "smd": true
}
```

#### Success Response:
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

#### Resolution Logic:
1. When `needs_confirmation: true`: The user is presented with the candidate list to select the exact manufacturer / package match.
2. When `needs_confirmation: false` and exactly 1 candidate remains: The application automatically triggers the download without asking an extra question.

---

### C. Datasheet Download

**Endpoint**: `POST /api/datasheets/download`  
**Description**: Fetches the selected PDF onto the server's local `datasheets` directory.

#### Request Body:
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

#### Success Response:
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
  "smd_code": null,
  "saved_path": "datasheets\\LM324.pdf"
}
```

*The frontend extracts only the filename portion (e.g. `LM324.pdf`) from `saved_path` to build the viewer URL.*

---

### D. Open PDF in App

**Endpoint**: `GET /api/datasheets/file/{filename}`  
**Example URL**: `http://localhost:8000/api/datasheets/file/LM324.pdf`  
**Response Header**: `Content-Type: application/pdf`

#### Embedding in Frontend:
```tsx
<iframe
  src={`${API_BASE_URL}/api/datasheets/file/${filename}`}
  className="w-full h-full border-0"
  title="Datasheet Viewer"
/>
```

---

## 3. Error Handling Contract

On error, the backend returns:
```json
{
  "detail": "Failed to resolve vendor page: connection timeout"
}
```
The frontend displays this error in a dedicated alert box with the exact message.

---

## 4. Frontend State & Architecture

1. **Home**: Quick search launcher or recent project picker.
2. **Search**:
   - Intent switch (Purchase vs Datasheet).
   - Kind switch (Normal part vs SMD code).
   - Extra details (Manufacturer, Package, Note) remembered in `localStorage` across searches.
   - Filter fallback: If filtering removes all offers, displays "Show all offers" button.
   - Price card action: "Find datasheet" reuses the offer's title + package.
3. **Project**:
   - BOM table with steppers, line totals, and project sum in ₹ INR.
   - Duplicate warning banner if 2 lines share the same title.
   - Saved datasheets list with 1-click viewer launcher.
   - CSV Export formatted for BOM purchasing.
4. **Viewer**:
   - Full-height iframe displaying the PDF.
   - Back button returning to previous view.
   - "Attach to Project" dropdown to save casual search PDFs.
