"use client";

import { useState, useEffect } from "react";
import { Shield, AlertTriangle, BookOpen, TrendingUp, TrendingDown, Minus, CheckCircle2, XCircle, RotateCcw, Eye } from "lucide-react";
import { ReliabilityWidget } from "../../../components/dashboard/ReliabilityWidget";

interface LearningEvent {
  id: string;
  content: string;
  category: string;
  importance: number;
  source: string | null;
  createdAt: string;
}

interface Incident {
  id: string;
  content: string;
  importance: number;
  createdAt: string;
}

export default function QualityPage() {
  const [learning, setLearning] = useState<LearningEvent[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"reliability" | "learning" | "incidents">("reliability");

  useEffect(() => {
    Promise.all([
      fetch("/api/quality/learning?limit=20").then((r) => r.json()),
      fetch("/api/quality/incidents?limit=20").then((r) => r.json()),
    ])
      .then(([learningRes, incidentsRes]) => {
        setLearning(learningRes?.data ?? []);
        setIncidents(incidentsRes?.data ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const tabs = [
    { id: "reliability" as const, label: "Reliability", icon: Shield },
    { id: "learning" as const, label: "Learning", icon: BookOpen },
    { id: "incidents" as const, label: "Incidents", icon: AlertTriangle },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">Quality & Learning</h1>
        <p className="mt-1 text-sm text-muted">AI workforce reliability, learning events, and incident tracking.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border border-hairline bg-canvas p-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "bg-white text-ink shadow-sm"
                  : "text-muted hover:text-ink"
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {activeTab === "reliability" && <ReliabilityWidget />}

      {activeTab === "learning" && (
        <div className="rounded-xl border border-hairline bg-white p-5">
          <h3 className="text-sm font-semibold text-ink mb-4">Learning Events</h3>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 rounded-lg bg-canvas animate-pulse" />
              ))}
            </div>
          ) : learning.length === 0 ? (
            <p className="text-sm text-muted text-center py-8">No learning events yet. Learning occurs when agents complete or fail tasks.</p>
          ) : (
            <div className="space-y-3">
              {learning.map((event) => (
                <div key={event.id} className="rounded-lg border border-hairline p-3">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-ink whitespace-pre-wrap">{event.content}</p>
                      <div className="mt-2 flex items-center gap-3">
                        <span className="inline-flex items-center rounded-full bg-canvas px-2 py-0.5 text-3xs font-medium text-muted">
                          {event.category}
                        </span>
                        <span className="text-3xs text-muted">
                          Importance: {event.importance}/10
                        </span>
                        <span className="text-3xs text-muted">
                          {new Date(event.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "incidents" && (
        <div className="rounded-xl border border-hairline bg-white p-5">
          <h3 className="text-sm font-semibold text-ink mb-4">Incidents</h3>
          {loading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="h-16 rounded-lg bg-canvas animate-pulse" />
              ))}
            </div>
          ) : incidents.length === 0 ? (
            <p className="text-sm text-muted text-center py-8">No incidents recorded. Incidents are created when serious failures occur.</p>
          ) : (
            <div className="space-y-3">
              {incidents.map((incident) => (
                <div key={incident.id} className="rounded-lg border border-red-200 bg-red-50 p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-red-800 whitespace-pre-wrap">{incident.content}</p>
                      <div className="mt-2 flex items-center gap-3">
                        <span className="text-3xs text-red-600">
                          Severity: {incident.importance >= 9 ? "Critical" : incident.importance >= 7 ? "High" : "Medium"}
                        </span>
                        <span className="text-3xs text-red-600">
                          {new Date(incident.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
