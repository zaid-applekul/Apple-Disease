import React, { useState, useEffect } from 'react';
import { AlertCircle, TrendingUp, Cloud, Droplets, ChevronDown } from 'lucide-react';
import {
  calculateDiseaseRisks,
  calculatePestRisks,
  ClimateParams,
} from '../utils/climateRiskRules';
import PlanetMapViewer from './PlanetMapViewer';

type View = 'Diseases' | 'Pests';

// Prevention strategies for common apple diseases
const diseasePreventionGuide: Record<string, string[]> = {
  'Apple Scab': [
    'Apply fungicides before rain during spring and early summer',
    'Remove fallen leaves and debris to reduce spore sources',
    'Ensure good canopy air circulation through pruning',
    'Avoid overhead irrigation that increases leaf wetness',
    'Use resistant apple varieties when possible',
  ],
  'Apple Leaf Blotch (Alternaria)': [
    'Remove infected leaves and fallen debris promptly',
    'Improve air circulation through canopy management',
    'Apply preventive fungicides during warm, humid periods',
    'Sanitize pruning tools to prevent spread',
    'Maintain balanced nitrogen fertilization',
  ],
  'Powdery Mildew': [
    'Apply sulfur or other fungicides during growing season',
    'Ensure adequate air flow by proper pruning',
    'Avoid over-fertilizing with nitrogen',
    'Remove infected leaves and shoots',
    'Plant resistant varieties in new orchards',
  ],
  'Brown Rot': [
    'Remove mummified fruit and dead twigs from trees',
    'Apply fungicides during bloom and fruit development',
    'Thin fruits to allow better air circulation',
    'Harvest carefully to avoid fruit wounds',
    'Control insects to prevent fruit entry points',
  ],
  "Bull's‑eye Rot": [
    'Remove fruit with lenticels wounds during storage',
    'Maintain good orchard sanitation',
    'Store fruit at optimal humidity (90-95%) and temperature',
    'Apply fungicides to fruit before storage',
    'Ensure proper harvest technique to minimize skin damage',
  ],
  'Sooty Blotch': [
    'Improve air circulation by pruning lower branches',
    'Apply fungicides mid-summer through fruit development',
    'Reduce humidity through better canopy management',
    'Thin fruit clusters for better exposure',
    'Manage nearby fruit flies to reduce fungal transport',
  ],
  'Flyspeck': [
    'Prune to improve air circulation within canopy',
    'Apply fungicides mid to late summer',
    'Manage humidity levels in the orchard',
    'Remove infected fruit before storage',
    'Sanitize storage facilities',
  ],
  'Collar / Root Rot': [
    'Improve soil drainage through orchard management',
    'Avoid waterlogging by controlling irrigation',
    'Remove affected trees if disease is severe',
    'Use resistant rootstocks when replanting',
    'Maintain proper tree spacing for air flow',
  ],
  'Fireblight': [
    'Prune out infected branches 12 inches below canker',
    'Sterilize tools between cuts to prevent spread',
    'Avoid nitrogen over-fertilization',
    'Apply copper or antibiotic sprays at bloom time',
    'Remove branches with active oozing cankers',
  ],
};

export default function ClimateRiskPredictor(): JSX.Element {
  const [view, setView] = useState<View>('Diseases');
  const [riskModel, setRiskModel] = useState<'standard' | 'meta'>('standard');
  const [isAutoFilling, setIsAutoFilling] = useState(false);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [showClimateForm, setShowClimateForm] = useState(false);

  const [viewParams, setViewParams] = useState<any>({
    temperature: 20,
    rh: 75,
    weeklyRainfall: 10,
    leafWetness: 4,
    windSpeed: 5,
    soilMoisture: 50,
    canopyHumidity: 75,
    dustLevel: 'unknown',
    drainage: 'unknown',
    hasStandingWater48h: false,
    hasTempJump10C: false,
    hadDroughtThenHeavyRain: false,
  });

  const [results, setResults] = useState<any[]>([]);
  const [farmHealthScore, setFarmHealthScore] = useState(85);

  const handleChange = (k: string, value: any) => {
    setViewParams((p) => ({ ...p, [k]: value }));
  };

  // Calculate Farm Health Score based on climate & disease risks
  const calculateFarmHealth = (climateParams: any, diseaseResults: any[]) => {
    // Climate Score (0-50 points)
    let climateScore = 50;

    // Penalize for adverse climate conditions
    if (climateParams.temperature < 15 || climateParams.temperature > 28) {
      climateScore -= 8; // Non-optimal temperature
    }
    if (climateParams.rh > 85) {
      climateScore -= 10; // High humidity favors diseases
    }
    if (climateParams.weeklyRainfall > 30) {
      climateScore -= 8; // Excessive rainfall
    }
    if (climateParams.leafWetness > 12) {
      climateScore -= 7; // Extended leaf wetness
    }
    if (climateParams.windSpeed < 2) {
      climateScore -= 5; // Poor air circulation
    }
    if (climateParams.hasStandingWater48h) {
      climateScore -= 10;
    }
    if (climateParams.hasTempJump10C) {
      climateScore -= 8;
    }
    if (climateParams.hadDroughtThenHeavyRain) {
      climateScore -= 9;
    }

    climateScore = Math.max(0, climateScore);

    // Disease Risk Score (0-50 points)
    // Based on number of diseases: More diseases = Lower score, Fewer diseases = Higher score
    let diseaseScore = 50;

    if (diseaseResults.length > 0) {
      const highRiskCount = diseaseResults.filter(
        (r) => r.level === 'High'
      ).length;
      const mediumRiskCount = diseaseResults.filter(
        (r) => r.level === 'Medium'
      ).length;
      const lowRiskCount = diseaseResults.filter(
        (r) => r.level === 'Low'
      ).length;

      // Calculate weighted penalty based on disease count and severity
      const highPenalty = highRiskCount * 15;    // 15 points per high-risk disease
      const mediumPenalty = mediumRiskCount * 8; // 8 points per medium-risk disease
      
      // Low-risk only affects score when >= 9
      const lowPenalty = lowRiskCount >= 9 ? lowRiskCount * 3 : 0;

      diseaseScore -= (highPenalty + mediumPenalty + lowPenalty);

      // Bonus for having very few diseases
      const totalDiseases = highRiskCount + mediumRiskCount + lowRiskCount;
      if (totalDiseases <= 2 && highRiskCount === 0) {
        diseaseScore += 10; // Bonus for minimal disease presence
      }
    } else {
      // No diseases = Maximum score
      diseaseScore = 50;
    }

    diseaseScore = Math.max(0, Math.min(50, diseaseScore));

    // Total Farm Health Score (0-100)
    const totalScore = Math.round((climateScore + diseaseScore) / 2);

    setFarmHealthScore(totalScore);
    return totalScore;
  };

  const handlePredict = () => {
    const paramsForRules: any = {
      temperature: Number(viewParams.temperature),
      rh: Number(viewParams.rh),
      relativeHumidity: Number(viewParams.rh),
      weeklyRainfall: Number(viewParams.weeklyRainfall),
      rainfall: Number(viewParams.weeklyRainfall),
      leafWetness: Number(viewParams.leafWetness),
      wetnessHours: Number(viewParams.leafWetness),
      windSpeed: Number(viewParams.windSpeed),
      soilMoisture:
        viewParams.soilMoisture !== undefined
          ? Number(viewParams.soilMoisture)
          : undefined,
      canopyHumidity:
        viewParams.canopyHumidity !== undefined
          ? Number(viewParams.canopyHumidity)
          : undefined,
      dustLevel: viewParams.dustLevel,
      drainage: viewParams.drainage,
      hasStandingWater48h: !!viewParams.hasStandingWater48h,
      hasTempJump10C: !!viewParams.hasTempJump10C,
      hadDroughtThenHeavyRain: !!viewParams.hadDroughtThenHeavyRain,
      mode: riskModel,
    };

    const res =
      view === 'Diseases'
        ? calculateDiseaseRisks(paramsForRules as ClimateParams)
        : calculatePestRisks(paramsForRules as ClimateParams);

    const resultsSliced = res.slice(0, 10);
    setResults(resultsSliced);

    // Calculate farm health based on climate and disease risks
    calculateFarmHealth(paramsForRules, resultsSliced);
  };

  const handlePlanetAutoFill = (params: Partial<Record<string, any>>) => {
    setIsAutoFilling(true);
    setViewParams((p) => ({ ...p, ...params }));

    // Auto-predict after data is filled
    setTimeout(() => {
      const updatedParams = { ...viewParams, ...params };
      const paramsForRules: any = {
        temperature: Number(updatedParams.temperature),
        rh: Number(updatedParams.rh),
        relativeHumidity: Number(updatedParams.rh),
        weeklyRainfall: Number(updatedParams.weeklyRainfall),
        rainfall: Number(updatedParams.weeklyRainfall),
        leafWetness: Number(updatedParams.leafWetness),
        wetnessHours: Number(updatedParams.leafWetness),
        windSpeed: Number(updatedParams.windSpeed),
        soilMoisture:
          updatedParams.soilMoisture !== undefined
            ? Number(updatedParams.soilMoisture)
            : undefined,
        canopyHumidity:
          updatedParams.canopyHumidity !== undefined
            ? Number(updatedParams.canopyHumidity)
            : undefined,
        dustLevel: updatedParams.dustLevel,
        drainage: updatedParams.drainage,
        hasStandingWater48h: !!updatedParams.hasStandingWater48h,
        hasTempJump10C: !!updatedParams.hasTempJump10C,
        hadDroughtThenHeavyRain: !!updatedParams.hadDroughtThenHeavyRain,
        mode: riskModel,
      };

      const res =
        view === 'Diseases'
          ? calculateDiseaseRisks(paramsForRules as ClimateParams)
          : calculatePestRisks(paramsForRules as ClimateParams);

      const resultsSliced = res.slice(0, 10);
      setResults(resultsSliced);

      // Calculate farm health
      calculateFarmHealth(paramsForRules, resultsSliced);
      setIsAutoFilling(false);
    }, 300);
  };

  const topResults = results.slice(0, 3);
  const highRiskCount = results.filter((r) => r.level === 'High').length;
  const mediumRiskCount = results.filter((r) => r.level === 'Medium').length;

  // Determine health status color
  const getHealthColor = () => {
    if (farmHealthScore >= 80) return 'emerald';
    if (farmHealthScore >= 60) return 'yellow';
    if (farmHealthScore >= 40) return 'orange';
    return 'red';
  };

  const getHealthColorClasses = (score: number) => {
    if (score >= 80)
      return {
        bg: 'bg-emerald-50',
        border: 'border-emerald-200',
        text: 'text-emerald-700',
        bar: 'bg-emerald-500',
      };
    if (score >= 60)
      return {
        bg: 'bg-yellow-50',
        border: 'border-yellow-200',
        text: 'text-yellow-700',
        bar: 'bg-yellow-500',
      };
    if (score >= 40)
      return {
        bg: 'bg-orange-50',
        border: 'border-orange-200',
        text: 'text-orange-700',
        bar: 'bg-orange-500',
      };
    return {
      bg: 'bg-red-50',
      border: 'border-red-200',
      text: 'text-red-700',
      bar: 'bg-red-500',
    };
  };

  const healthColors = getHealthColorClasses(farmHealthScore);

  return (
    <div className="card card-lg h-full flex flex-col">
      {/* HEADER */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-green-200">
        <div className="flex items-center space-x-2">
          <Cloud className="w-5 h-5 text-green-600" />
          <span className="text-lg font-semibold text-green-900">
            🌤️ Climate Risk Predictor
          </span>
        </div>
        <div className="flex space-x-1 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setView('Diseases')}
            className={`px-3 py-1 rounded text-xs font-medium transition-all ${
              view === 'Diseases'
                ? 'bg-green-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-200'
            }`}
          >
            🌿 Diseases
          </button>
          <button
            onClick={() => setView('Pests')}
            className={`px-3 py-1 rounded text-xs font-medium transition-all ${
              view === 'Pests'
                ? 'bg-green-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-200'
            }`}
          >
            🐛 Pests
          </button>
        </div>
      </div>

      {/* AUTO-FILL INDICATOR */}
      {isAutoFilling && (
        <div className="mb-3 px-3 py-2 bg-green-50 border border-green-200 rounded text-xs text-green-700 flex items-center space-x-2">
          <div className="w-2 h-2 bg-green-600 rounded-full animate-pulse"></div>
          <span>Loading live climate data from Planet...</span>
        </div>
      )}

      {/* Toggle Button for Climate Form */}
      <button
        onClick={() => setShowClimateForm(!showClimateForm)}
        className={`mb-3 w-full px-4 py-2.5 rounded-lg text-sm font-semibold transition-all shadow-sm ${
          showClimateForm
            ? 'bg-blue-600 text-white hover:bg-blue-700'
            : 'bg-green-600 text-white hover:bg-green-700'
        }`}
      >
        {showClimateForm ? '✏️ Manual Mode' : '🤖 Automatic Mode'}
      </button>

      {/* 2-column layout - hide left panel unless form is shown */}
      <div className={`grid gap-4 flex-1 overflow-hidden ${showClimateForm ? 'grid-cols-1 lg:grid-cols-[1fr_1.6fr]' : 'grid-cols-1'}`}>
        {/* LEFT PANEL: Climate inputs - only shown if toggled */}
        {showClimateForm && (
        <div className="flex flex-col gap-3 overflow-y-auto pr-2">
          {/* Risk Model */}
          <div className="bg-gradient-to-br from-gray-50 to-gray-100 p-3 rounded-lg border border-gray-200">
            <div className="mb-3">
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                Risk Model
              </label>
              <select
                value={riskModel}
                onChange={(e) => setRiskModel(e.target.value as any)}
                className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-md hover:border-gray-400 focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all bg-white"
              >
                <option value="standard">📋 Standard (rule-based)</option>
                <option value="meta">📊 Meta (range-based)</option>
              </select>
            </div>
          </div>

          {/* Climate Parameters */}
          <div className="bg-gradient-to-br from-gray-50 to-gray-100 p-3 rounded-lg border border-gray-200">
            <div className="flex items-center space-x-2 mb-2.5">
              <Droplets className="w-3.5 h-3.5 text-blue-600" />
              <span className="text-xs font-semibold text-gray-700">
                Climate Parameters
              </span>
            </div>
            <div className="space-y-2">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  🌡️ Temp (°C)
                </label>
                <input
                  type="number"
                  value={viewParams.temperature}
                  onChange={(e) =>
                    handleChange('temperature', Number(e.target.value))
                  }
                  className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-md hover:border-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  💧 RH (%)
                </label>
                <input
                  type="number"
                  value={viewParams.rh}
                  onChange={(e) => handleChange('rh', Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-md hover:border-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  🌧️ Weekly Rainfall (mm)
                </label>
                <input
                  type="number"
                  value={viewParams.weeklyRainfall}
                  onChange={(e) =>
                    handleChange('weeklyRainfall', Number(e.target.value))
                  }
                  className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-md hover:border-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  🍃 Leaf Wetness (h)
                </label>
                <input
                  type="number"
                  value={viewParams.leafWetness}
                  onChange={(e) =>
                    handleChange('leafWetness', Number(e.target.value))
                  }
                  className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-md hover:border-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  💨 Wind Speed (km/h)
                </label>
                <input
                  type="number"
                  value={viewParams.windSpeed}
                  onChange={(e) =>
                    handleChange('windSpeed', Number(e.target.value))
                  }
                  className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-md hover:border-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  🌍 Soil Moisture (%)
                  <span className="text-gray-400 font-normal text-[10px] ml-1">
                    opt
                  </span>
                </label>
                <input
                  type="number"
                  value={viewParams.soilMoisture}
                  onChange={(e) =>
                    handleChange('soilMoisture', Number(e.target.value))
                  }
                  className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-md hover:border-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  ☁️ Canopy Humidity (%)
                  <span className="text-gray-400 font-normal text-[10px] ml-1">
                    opt
                  </span>
                </label>
                <input
                  type="number"
                  value={viewParams.canopyHumidity}
                  onChange={(e) =>
                    handleChange('canopyHumidity', Number(e.target.value))
                  }
                  className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-md hover:border-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>

              {/* DRILL-DOWN SECTION */}
              <button
                onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                className="w-full flex items-center justify-between px-2.5 py-2 rounded-md bg-white border border-gray-300 hover:bg-gray-50 transition-all mt-1"
              >
                <span className="text-xs font-medium text-gray-700">
                  🔧 Advanced Options
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-gray-600 transition-transform ${
                    showAdvancedOptions ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {/* EXPANDED ADVANCED OPTIONS */}
              {showAdvancedOptions && (
                <div className="mt-2 p-2.5 bg-white border border-blue-200 rounded-lg space-y-2.5">
                  {/* Condition Checkboxes */}
                  <div className="space-y-1.5">
                    <label className="flex items-center space-x-2 cursor-pointer hover:bg-blue-50 p-1.5 rounded transition-colors">
                      <input
                        type="checkbox"
                        checked={viewParams.hasStandingWater48h}
                        onChange={(e) =>
                          handleChange('hasStandingWater48h', e.target.checked)
                        }
                        className="w-3.5 h-3.5 rounded accent-blue-600"
                      />
                      <span className="text-xs text-gray-700">
                        💧 Standing water &gt;48h
                      </span>
                    </label>
                    <label className="flex items-center space-x-2 cursor-pointer hover:bg-blue-50 p-1.5 rounded transition-colors">
                      <input
                        type="checkbox"
                        checked={viewParams.hasTempJump10C}
                        onChange={(e) =>
                          handleChange('hasTempJump10C', e.target.checked)
                        }
                        className="w-3.5 h-3.5 rounded accent-blue-600"
                      />
                      <span className="text-xs text-gray-700">
                        🌡️ Temp jump &gt;10°C
                      </span>
                    </label>
                    <label className="flex items-center space-x-2 cursor-pointer hover:bg-blue-50 p-1.5 rounded transition-colors">
                      <input
                        type="checkbox"
                        checked={viewParams.hadDroughtThenHeavyRain}
                        onChange={(e) =>
                          handleChange(
                            'hadDroughtThenHeavyRain',
                            e.target.checked
                          )
                        }
                        className="w-3.5 h-3.5 rounded accent-blue-600"
                      />
                      <span className="text-xs text-gray-700">
                        🌩️ Drought then heavy rain
                      </span>
                    </label>
                  </div>

                  {/* Selects */}
                  <div className="space-y-2 border-t border-gray-200 pt-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        ✨ Dust Level
                      </label>
                      <select
                        value={viewParams.dustLevel}
                        onChange={(e) =>
                          handleChange('dustLevel', e.target.value)
                        }
                        className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-md hover:border-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white"
                      >
                        <option value="unknown">Unknown</option>
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        🌊 Drainage
                      </label>
                      <select
                        value={viewParams.drainage}
                        onChange={(e) =>
                          handleChange('drainage', e.target.value)
                        }
                        className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-md hover:border-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white"
                      >
                        <option value="unknown">Unknown</option>
                        <option value="good">Good</option>
                        <option value="poor">Poor</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 mt-4">
              <button
                onClick={handlePredict}
                disabled={isAutoFilling}
                className="flex-1 bg-gradient-to-r from-green-600 to-green-700 text-white px-3 py-2 rounded-lg text-xs font-semibold hover:from-green-700 hover:to-green-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-md"
              >
                🔍 Predict Risk
              </button>
              <button
                onClick={() => {
                  setResults([]);
                  setFarmHealthScore(85);
                }}
                className="flex-1 px-3 py-2 rounded-lg text-xs font-medium border border-gray-300 text-gray-700 hover:bg-gray-100 transition-all"
              >
                Clear
              </button>
            </div>
          </div>

          {/* FARM HEALTH SCORE - BELOW BUTTONS */}
          <div
            className={`${healthColors.bg} ${healthColors.border} p-4 rounded-lg border`}
          >
            <div className="text-xs font-semibold text-gray-700 mb-2">
              🌱 Farm Health Score
            </div>
            <div className="text-center">
              <div className={`text-4xl font-bold ${healthColors.text} mb-1`}>
                {farmHealthScore}%
              </div>
              <div className="text-[11px] text-gray-600 mb-3">
                Overall Farm Condition
              </div>

              {/* Progress bar */}
              <div className="w-full h-2 bg-gray-300 rounded-full overflow-hidden mb-2">
                <div
                  className={`h-full ${healthColors.bar} transition-all duration-500`}
                  style={{ width: `${farmHealthScore}%` }}
                ></div>
              </div>

              {/* Health status text */}
              <div className={`text-xs font-semibold ${healthColors.text}`}>
                {farmHealthScore >= 80
                  ? '✅ Excellent'
                  : farmHealthScore >= 60
                  ? '⚠️ Good'
                  : farmHealthScore >= 40
                  ? '⚡ Fair'
                  : '🚨 Poor'}
              </div>
            </div>
          </div>
        </div>
        )}

        {/* RIGHT PANEL: Planet Map Viewer - full width unless climate form is shown */}
        <div className="h-full overflow-hidden rounded-lg border border-gray-200">
          <PlanetMapViewer
            initialLat={viewParams.latitude ?? 34.1}
            initialLon={viewParams.longitude ?? 74.8}
            configId="0dc5fcdc-69e2-4789-8511-6b0cc7efbff3"
            onAutoFill={handlePlanetAutoFill}
          />
        </div>
      </div>

      {/* RESULTS SECTION - BOTTOM */}
      {results.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          {/* Risk Summary */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-center">
              <div className="text-sm font-bold text-red-700">{highRiskCount}</div>
              <div className="text-xs text-red-600">High Risk</div>
            </div>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2 text-center">
              <div className="text-sm font-bold text-yellow-700">
                {mediumRiskCount}
              </div>
              <div className="text-xs text-yellow-600">Medium Risk</div>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-lg p-2 text-center">
              <div className="text-sm font-bold text-green-700">
                {results.filter((r) => r.level === 'Low').length}
              </div>
              <div className="text-xs text-green-600">Low Risk</div>
            </div>
          </div>

          {/* Results List */}
          <div className="flex items-center space-x-2 mb-2">
            <TrendingUp className="w-3.5 h-3.5 text-gray-600" />
            <span className="text-xs font-semibold text-gray-700">
              Top {Math.min(3, results.length)} Risk(s)
            </span>
          </div>

          <div className="space-y-2 max-h-48 overflow-y-auto">
            {topResults.map((r, idx) => (
              <div
                key={r.name}
                className="border border-gray-200 rounded-lg p-2.5 bg-gradient-to-r from-gray-50 to-white text-xs hover:shadow-sm transition-shadow"
              >
                <div className="font-semibold flex items-center justify-between mb-1">
                  <div className="flex items-center space-x-2">
                    <span className="text-gray-500">#{idx + 1}</span>
                    <span className="text-gray-800">{r.name}</span>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                      r.level === 'High'
                        ? 'bg-red-100 text-red-700'
                        : r.level === 'Medium'
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-green-100 text-green-700'
                    }`}
                  >
                    {r.level}
                  </span>
                </div>
                <div className="text-gray-600 mb-1">
                  📊 Score: <span className="font-semibold">{r.score}</span>
                </div>
                {r.matchedFactors.length > 0 && (
                  <div className="mt-2 text-[11px] text-gray-600 bg-white p-1.5 rounded border border-gray-100">
                    <div className="font-medium text-gray-700 mb-1.5">
                      💡 Prevention Tips:
                    </div>
                    {(diseasePreventionGuide[r.name] || []).slice(0, 2).map((tip: string) => (
                      <div key={tip} className="text-gray-600 mb-1 leading-tight">
                        • {tip}
                      </div>
                    ))}
                    {(diseasePreventionGuide[r.name] || []).length > 2 && (
                      <div className="text-gray-500 text-[10px] mt-1.5 pt-1 border-t border-gray-100">
                        +{diseasePreventionGuide[r.name].length - 2} more prevention strategies
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* EMPTY STATE */}
      {results.length === 0 && (
        <div className="mt-4 text-center py-8 text-gray-500">
          <AlertCircle className="w-8 h-8 mx-auto mb-2 text-gray-400" />
          <p className="text-xs font-medium">
            Select parameters and click "Predict Risk" or use Planet data
          </p>
        </div>
      )}
    </div>
  );
}
