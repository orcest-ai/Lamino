import { formatDateTimeAsMoment } from "@/utils/directories";
import { numberWithCommas } from "@/utils/numbers";
import React, { useEffect, useState, useContext } from "react";
const MetricsContext = React.createContext();
const SHOW_METRICS_KEY = "lamino_show_chat_metrics";
const SHOW_METRICS_EVENT = "lamino_show_metrics_change";

/**
 * @param {number} duration - duration in milliseconds
 * @returns {string}
 */
function formatDuration(duration) {
  try {
    return duration < 1
      ? `${(duration * 1000).toFixed(0)}ms`
      : `${duration.toFixed(3)}s`;
  } catch {
    return "";
  }
}

/**
 * Format the output TPS to a string
 * @param {number} outputTps - output TPS
 * @returns {string}
 */
function formatTps(outputTps) {
  try {
    return outputTps < 1000
      ? outputTps.toFixed(2)
      : numberWithCommas(outputTps.toFixed(0));
  } catch {
    return "";
  }
}

/**
 * Get the show metrics setting from localStorage `lamino_show_chat_metrics` key
 * @returns {boolean}
 */
function getAutoShowMetrics() {
  return window?.localStorage?.getItem(SHOW_METRICS_KEY) === "true";
}

/**
 * Estimate cost for a given number of tokens.
 * @param {number} promptTokens
 * @param {number} completionTokens
 * @param {string} costTierLabel
 * @returns {string}
 */
function estimateCost(promptTokens = 0, completionTokens = 0, costTierLabel = "") {
  // Rough cost estimation per 1M tokens based on cost tier
  const costRates = {
    "Free": { input: 0, output: 0 },
    "Internal Free": { input: 0, output: 0 },
    "External Free": { input: 0, output: 0 },
    "Cheap": { input: 0.15, output: 0.60 },
    "Normal Cost": { input: 1.0, output: 3.0 },
    "Too Expensive": { input: 3.0, output: 15.0 },
    "Most Expensive": { input: 15.0, output: 75.0 },
  };
  const rate = costRates[costTierLabel] || costRates["Normal Cost"];
  const cost = (promptTokens * rate.input + completionTokens * rate.output) / 1_000_000;
  if (cost === 0) return "Free";
  if (cost < 0.01) return `~$${(cost * 100).toFixed(2)}\u00A2`;
  return `~$${cost.toFixed(4)}`;
}

/**
 * Build the metrics string for a given metrics object
 * - Routing chain (if available)
 * - Model name
 * - Duration and output TPS
 * - Token usage
 * - Cost estimate
 * - Timestamp
 * @param {metrics: {duration:number, outputTps: number, model?: string, timestamp?: number, routingChain?: string, costTierSymbol?: string, costTierLabel?: string, prompt_tokens?: number, completion_tokens?: number}} metrics
 * @returns {string}
 */
function buildMetricsString(metrics = {}) {
  const parts = [];

  // Routing chain display (e.g., "RainyModel >> OpenRouter >> GPT5 Pro")
  if (metrics?.routingChain) {
    parts.push(`${metrics.costTierSymbol || ""} ${metrics.routingChain}`);
  } else if (metrics?.model) {
    parts.push(metrics.model);
  }

  // Duration and throughput
  if (metrics?.duration && metrics?.outputTps) {
    parts.push(
      `${formatDuration(metrics.duration)} (${formatTps(metrics.outputTps)} tok/s)`
    );
  }

  // Token usage
  const promptTokens = metrics?.prompt_tokens || 0;
  const completionTokens = metrics?.completion_tokens || 0;
  const totalTokens = promptTokens + completionTokens;
  if (totalTokens > 0) {
    parts.push(`${numberWithCommas(totalTokens)} tokens`);
  }

  // Cost estimate
  if (metrics?.costTierLabel) {
    const costStr = estimateCost(promptTokens, completionTokens, metrics.costTierLabel);
    parts.push(costStr);
  }

  // Timestamp
  if (metrics?.timestamp) {
    parts.push(formatDateTimeAsMoment(metrics.timestamp, "MMM D, h:mm A"));
  }

  return parts.filter(Boolean).join(" \u00B7 ");
}

/**
 * Toggle the show metrics setting in localStorage `lamino_show_chat_metrics` key
 * @returns {void}
 */
function toggleAutoShowMetrics() {
  const currentValue = getAutoShowMetrics() || false;
  window?.localStorage?.setItem(SHOW_METRICS_KEY, !currentValue);
  window.dispatchEvent(
    new CustomEvent(SHOW_METRICS_EVENT, {
      detail: { showMetricsAutomatically: !currentValue },
    })
  );
  return !currentValue;
}

/**
 * Provider for the metrics context that controls the visibility of the metrics
 * per-chat based on the user's preference.
 * @param {React.ReactNode} children
 * @returns {React.ReactNode}
 */
export function MetricsProvider({ children }) {
  const [showMetricsAutomatically, setShowMetricsAutomatically] =
    useState(getAutoShowMetrics());

  useEffect(() => {
    function handleShowingMetricsEvent(e) {
      if (!e?.detail?.hasOwnProperty("showMetricsAutomatically")) return;
      setShowMetricsAutomatically(e.detail.showMetricsAutomatically);
    }
    console.log("Adding event listener for metrics visibility");
    window.addEventListener(SHOW_METRICS_EVENT, handleShowingMetricsEvent);
    return () =>
      window.removeEventListener(SHOW_METRICS_EVENT, handleShowingMetricsEvent);
  }, []);

  return (
    <MetricsContext.Provider
      value={{ showMetricsAutomatically, setShowMetricsAutomatically }}
    >
      {children}
    </MetricsContext.Provider>
  );
}

/**
 * Render the metrics for a given chat, if available
 * @param {metrics: {duration:number, outputTps: number, model: string, timestamp: number}} props
 * @returns
 */
export default function RenderMetrics({ metrics = {} }) {
  // Inherit the showMetricsAutomatically state from the MetricsProvider so the state is shared across all chats
  const { showMetricsAutomatically, setShowMetricsAutomatically } =
    useContext(MetricsContext);
  if (!metrics?.duration || !metrics?.outputTps) return null;

  return (
    <button
      type="button"
      onClick={() => setShowMetricsAutomatically(toggleAutoShowMetrics())}
      data-tooltip-id="metrics-visibility"
      data-tooltip-content={
        showMetricsAutomatically
          ? "Click to only show metrics when hovering"
          : "Click to show metrics as soon as they are available"
      }
      className={`border-none flex justify-end items-center gap-x-[8px] ${showMetricsAutomatically ? "opacity-100" : "opacity-0"} md:group-hover:opacity-100 transition-all duration-300`}
    >
      <p className="cursor-pointer text-xs font-mono text-theme-text-secondary opacity-50">
        {buildMetricsString(metrics)}
      </p>
    </button>
  );
}
