"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle, Clock, TrendingUp } from "lucide-react";

interface Prediction {
  ticketId: string;
  responseBreachRisk: number;
  resolutionBreachRisk: number;
  estimatedResolutionMinutes: number;
  factors: string[];
}

interface SlaPredictionPanelProps {
  ticketId: string;
}

export default function SlaPredictionPanel({ ticketId }: SlaPredictionPanelProps) {
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetch(`/api/helpdesk/predict?ticketId=${encodeURIComponent(ticketId)}`)
      .then((r) => {
        if (!r.ok) throw new Error("Prediction not available");
        return r.json();
      })
      .then((data) => { if (!cancelled) setPrediction(data); })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ticketId]);

  if (loading) return <div className="text-xs text-text-muted">Analyzing SLA risk…</div>;
  if (error || !prediction) return null;

  const riskColor = (risk: number) => risk >= 0.7 ? "#ef4444" : risk >= 0.4 ? "#f59e0b" : "#22c55e";
  const riskLabel = (risk: number) => risk >= 0.7 ? "High" : risk >= 0.4 ? "Medium" : "Low";
  const RiskIcon = ({ risk }: { risk: number }) =>
    risk >= 0.7 ? <AlertTriangle className="w-3 h-3" /> : risk >= 0.4 ? <Clock className="w-3 h-3" /> : <CheckCircle className="w-3 h-3" />;

  const formatMinutes = (mins: number) => {
    if (mins < 60) return `${mins}m`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
  };

  return (
    <div className="hd-detail-section">
      <h4 className="hd-detail-section-title"><TrendingUp className="w-3 h-3" /> SLA Prediction</h4>
      <div className="flex gap-3 flex-wrap text-xs">
        <div className="flex items-center gap-1" style={{ color: riskColor(prediction.responseBreachRisk) }}>
          <RiskIcon risk={prediction.responseBreachRisk} />
          Response: {riskLabel(prediction.responseBreachRisk)} ({Math.round(prediction.responseBreachRisk * 100)}%)
        </div>
        <div className="flex items-center gap-1" style={{ color: riskColor(prediction.resolutionBreachRisk) }}>
          <RiskIcon risk={prediction.resolutionBreachRisk} />
          Resolution: {riskLabel(prediction.resolutionBreachRisk)} ({Math.round(prediction.resolutionBreachRisk * 100)}%)
        </div>
        {prediction.estimatedResolutionMinutes > 0 && (
          <div className="text-text-muted">
            Est. resolution: {formatMinutes(prediction.estimatedResolutionMinutes)}
          </div>
        )}
      </div>
      {prediction.factors.length > 0 && (
        <ul className="text-xs text-text-muted mt-1">
          {prediction.factors.map((f, i) => <li key={i}>• {f}</li>)}
        </ul>
      )}
    </div>
  );
}
