
# OrchardIntel: Apple Disease Detector with Planet Climate Risk Advisor

A **React + TypeScript** app for apple leaf disease prediction, dataset management, model training simulation, climate risk analysis with **Planet map viewer**, and **Supabase Edge Functions** integration.

---

## Features ✨

### Disease Prediction
- Detect **6 classes** with confidence scores and treatment advice:
  - Healthy, Apple Scab, Apple Rust, Powdery Mildew, Fire Blight, Black Rot
- Client-side preprocessing + `enhancedClassifier` (mock) or `realClassifier` via Supabase Edge Function
- Display all class probabilities with the top prediction highlighted

### Dataset Management
- Drag-and-drop folder upload (subfolder-based classification: `healthy/`, `apple_scab/`, etc.)
- Support for **Train/Test/Validation** dataset types
- Class distribution charts and metadata capture

### Model Training
- Configurable parameters: epochs, batch size, learning rate, validation split, augmentation
- Real-time progress simulation via `TrainingProgress`
- Edge Function support: `train-model`

### Climate Risk Predictor
- Rule-based engine for diseases/pests with **Standard** and **Meta** scoring
- Planet WMTS map viewer + Open-Meteo climate data
- Per-disease tie-breaker weights (~1.05–1.1)

### Additional Features
- **28 Planet Insights Layers** → PSRI (Fire Blight), ExG (Leaf Disease), NDMI (Scab Risk)
- **Drilldown UI** → 5 groups: Vegetation / Apple Disease / Moisture / Visual / Other
- **Live Kashmir Orchards** → 34.1°N, 74.8°E (Sopore apple belt)
- **Supabase Edge Functions** → Planet API proxy
- **Leaflet Maps** → WMTS tiles streaming

### Authentication
- Supabase email/password auth + guest mode
- Feature-gated UI flows

---

## Dataset Structure

```
your-dataset/
  healthy/           # image1.jpg, image2.png...
  apple_scab/
  apple_rust/
  powdery_mildew/
  fire_blight/
  black_rot/
```

> Uses `webkitRelativePath` for auto-classification (Chrome/Edge recommended).

---

## Quick Start

```bash
# Install dependencies & start dev server
npm install
npm run dev

# Build & preview
npm run build
npm run preview
```

Optional `.env` (frontend):

```bash
VITE_SUPABASE_URL=your_url
VITE_SUPABASE_ANON_KEY=your_key
```

> Planet API keys are configured in Supabase Edge Functions, **not the frontend**.

---

## Project Structure

```
src/
  components/
    ImageUpload.tsx
    PredictionResults.tsx
    DatasetManager.tsx
    TrainingProgress.tsx
    ClimateRiskPredictor.tsx
    PlanetMapViewer.tsx
    Auth.tsx
  services/
    datasetService.ts
    modelService.ts
    predictionService.ts
    planetService.ts        # fetchPlanetInsights
  utils/
    realClassifier.ts
    enhancedClassifier.ts
    climateRiskRules.ts     # calculateDiseaseRisks / calculatePestRisks
    imagePreprocessing.ts

supabase/functions/
  predict-disease/
  train-model/
  planet-proxy/             # WMTS tiles
  planet-insights/          # Climate data
```

---

## Usage

### 1. Disease Prediction
```
Upload -> Preprocess -> Classify (mock/Edge) -> Display Results + Treatment
```

### 2. Dataset Management
```
DatasetManager -> Select type -> Drag folder -> Auto-classify
```

### 3. Training
```
Configure parameters -> Start -> Live metrics (loss/accuracy)
```

### 4. Climate Risk Prediction
```
Planet map -> Auto-fill climate -> Standard/Meta scoring -> Top risks
```

---

## Climate Risk Engine

- **Scoring (0–100):**
  - Standard: +20 per matched rule
  - Meta: Continuous climate ranges
- **Risk Levels:**

| Range    | Level   |
|----------|--------|
| 0–30     | Low     |
| 31–70    | Medium  |
| 71–100   | High    |

- Tie-breaker: `diseaseWeights` in `climateRiskRules.ts`

---

## Supabase Setup

```bash
supabase functions deploy predict-disease train-model planet-proxy planet-insights
```

**Function ENV variables:**

```bash
PLANET_API_KEY=...
PLANET_CONFIG_ID_JK=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

- Database schema: `supabase/migrations/20251222061318_odd_trail.sql` (with RLS & buckets)

---

## Disease Classes

| Disease            | Severity | Description                |
|-------------------|----------|----------------------------|
| Healthy            | Low      | Normal leaves             |
| Apple Scab         | High     | Dark fungal lesions       |
| Apple Rust         | Medium   | Orange cedar rust spots   |
| Powdery Mildew     | Medium   | White powdery coating     |
| Fire Blight        | High     | Bacterial burn            |
| Black Rot          | High     | Brown spots + purple      |

---

## Troubleshooting

| Issue            | Solution                                     |
|------------------|---------------------------------------------|
| Planet 400       | Ensure `PLANET_API_KEY` is set in functions |
| Folder upload    | Use Chrome/Edge and select a folder         |
| No climate data  | Mock fallback is active                      |
| Limited features | Add frontend `.env` variables               |

---

## Contributing

```bash
git checkout -b feature/name
# Add rule changes or examples
git push origin feature/name && create PR
```

---

## License

MIT License – Issues and contributions welcome.

---

## Author

**Za.i.14**
### Contact
For more information, please contact Zai14 through his Socials:
 [![Instagram](https://img.shields.io/badge/Instagram-%23E4405F.svg?logo=Instagram&logoColor=white)](https://instagram.com/Za.i.14) [![LinkedIn](https://img.shields.io/badge/LinkedIn-%230077B5.svg?logo=linkedin&logoColor=white)](https://linkedin.com/in/zai14) [![X](https://img.shields.io/badge/X-black.svg?logo=X&logoColor=white)](https://x.com/Za_i14) [![YouTube](https://img.shields.io/badge/YouTube-%23FF0000.svg?logo=YouTube&logoColor=white)](https://youtube.com/@Za.i.14) [![email](https://img.shields.io/badge/Email-D14836?logo=gmail&logoColor=white)](mailto:ZaidShabir67@gmail.com)

*Built with ❤️ for the Crop Community using React + Supabase + Planet APIs.*
