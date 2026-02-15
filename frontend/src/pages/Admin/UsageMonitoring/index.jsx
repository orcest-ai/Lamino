import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/SettingsSidebar";
import { isMobile } from "react-device-detect";
import * as Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import Admin from "@/models/admin";
import CTAButton from "@/components/lib/CTAButton";
import showToast from "@/utils/toast";

const BREAKDOWN_OPTIONS = [
  "eventType",
  "userId",
  "workspaceId",
  "teamId",
  "provider",
  "model",
  "mode",
];

export default function AdminUsageMonitoring() {
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [breakdownBy, setBreakdownBy] = useState("eventType");
  const [overview, setOverview] = useState(null);
  const [series, setSeries] = useState([]);
  const [breakdown, setBreakdown] = useState([]);

  const query = useMemo(() => ({ days }), [days]);

  const loadData = async () => {
    setLoading(true);
    const [summary, timeline, grouped] = await Promise.all([
      Admin.usageOverview(query),
      Admin.usageTimeSeries({ ...query, interval: "day" }),
      Admin.usageBreakdown({ ...query, by: breakdownBy }),
    ]);
    setOverview(summary);
    setSeries(timeline);
    setBreakdown(grouped);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [days, breakdownBy]);

  const exportCsv = async () => {
    const csv = await Admin.usageExportCsv(query);
    if (!csv) {
      showToast("Failed exporting usage CSV.", "error");
      return;
    }
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `usage-events-${days}d.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast("Usage CSV exported.", "success");
  };

  return (
    <div className="w-screen h-screen overflow-hidden bg-theme-bg-container flex">
      <Sidebar />
      <div
        style={{ height: isMobile ? "100%" : "calc(100% - 32px)" }}
        className="relative md:ml-[2px] md:mr-[16px] md:my-[16px] md:rounded-[16px] bg-theme-bg-secondary w-full h-full overflow-y-scroll p-4 md:p-0"
      >
        <div className="flex flex-col w-full px-1 md:pl-6 md:pr-[50px] md:py-6 py-16">
          <div className="w-full flex flex-col gap-y-1 pb-6 border-white/10 border-b-2">
            <div className="items-center flex gap-x-4">
              <p className="text-lg leading-6 font-bold text-theme-text-primary">
                Usage Monitoring
              </p>
            </div>
            <p className="text-xs leading-[18px] font-base text-theme-text-secondary">
              Monitor enterprise usage events, token consumption, and
              model/provider breakdowns.
            </p>
          </div>

          <div className="flex flex-wrap gap-4 items-end py-4">
            <div>
              <label className="text-theme-text-secondary text-xs block mb-1">
                Time Window (days)
              </label>
              <input
                type="number"
                min={1}
                max={365}
                value={days}
                onChange={(e) => setDays(Number(e.target.value || 30))}
                className="border-none bg-theme-settings-input-bg text-white text-sm rounded-lg outline-none block w-32 p-2.5"
              />
            </div>
            <div>
              <label className="text-theme-text-secondary text-xs block mb-1">
                Breakdown By
              </label>
              <select
                value={breakdownBy}
                onChange={(e) => setBreakdownBy(e.target.value)}
                className="border-none bg-theme-settings-input-bg text-white text-sm rounded-lg outline-none block w-48 p-2.5"
              >
                {BREAKDOWN_OPTIONS.map((field) => (
                  <option key={field} value={field}>
                    {field}
                  </option>
                ))}
              </select>
            </div>
            <CTAButton onClick={loadData}>Refresh</CTAButton>
            <CTAButton onClick={exportCsv}>Export CSV</CTAButton>
          </div>

          {loading ? (
            <Skeleton.default
              height="60vh"
              width="100%"
              highlightColor="var(--theme-bg-primary)"
              baseColor="var(--theme-bg-secondary)"
              count={1}
              className="w-full p-4 rounded-b-2xl rounded-tr-2xl rounded-tl-sm mt-2"
              containerClassName="flex w-full"
            />
          ) : (
            <div className="space-y-6 pb-12">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <StatCard title="Events" value={overview?.events ?? 0} />
                <StatCard
                  title="Prompt Tokens"
                  value={overview?.promptTokens ?? 0}
                />
                <StatCard
                  title="Completion Tokens"
                  value={overview?.completionTokens ?? 0}
                />
                <StatCard
                  title="Total Tokens"
                  value={overview?.totalTokens ?? 0}
                />
                <StatCard
                  title="Duration (ms)"
                  value={overview?.durationMs ?? 0}
                />
              </div>

              <section>
                <h3 className="text-theme-text-primary font-semibold mb-2">
                  Timeseries
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left rounded-lg min-w-[640px] border-spacing-0">
                    <thead className="text-theme-text-secondary text-xs leading-[18px] font-bold uppercase border-white/10 border-b">
                      <tr>
                        <th className="px-6 py-3 rounded-tl-lg">Period</th>
                        <th className="px-6 py-3">Events</th>
                        <th className="px-6 py-3">Prompt</th>
                        <th className="px-6 py-3">Completion</th>
                        <th className="px-6 py-3 rounded-tr-lg">
                          Total Tokens
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {series.length === 0 ? (
                        <tr className="bg-transparent text-theme-text-secondary text-sm font-medium">
                          <td colSpan="5" className="px-6 py-4 text-center">
                            No usage events found in selected range.
                          </td>
                        </tr>
                      ) : (
                        series.map((point) => (
                          <tr
                            key={point.period}
                            className="bg-transparent text-white text-opacity-80 text-xs font-medium border-b border-white/10 h-10"
                          >
                            <td className="px-6">{point.period}</td>
                            <td className="px-6">{point.events}</td>
                            <td className="px-6">{point.promptTokens}</td>
                            <td className="px-6">{point.completionTokens}</td>
                            <td className="px-6">{point.totalTokens}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <section>
                <h3 className="text-theme-text-primary font-semibold mb-2">
                  Breakdown: {breakdownBy}
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left rounded-lg min-w-[640px] border-spacing-0">
                    <thead className="text-theme-text-secondary text-xs leading-[18px] font-bold uppercase border-white/10 border-b">
                      <tr>
                        <th className="px-6 py-3 rounded-tl-lg">
                          {breakdownBy}
                        </th>
                        <th className="px-6 py-3">Events</th>
                        <th className="px-6 py-3">Prompt</th>
                        <th className="px-6 py-3">Completion</th>
                        <th className="px-6 py-3 rounded-tr-lg">
                          Total Tokens
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {breakdown.length === 0 ? (
                        <tr className="bg-transparent text-theme-text-secondary text-sm font-medium">
                          <td colSpan="5" className="px-6 py-4 text-center">
                            No grouped usage data found.
                          </td>
                        </tr>
                      ) : (
                        breakdown.map((row, index) => (
                          <tr
                            key={`${row[breakdownBy] ?? "null"}-${index}`}
                            className="bg-transparent text-white text-opacity-80 text-xs font-medium border-b border-white/10 h-10"
                          >
                            <td className="px-6">
                              {String(row[breakdownBy] ?? "--")}
                            </td>
                            <td className="px-6">{row?._count?.id ?? 0}</td>
                            <td className="px-6">
                              {row?._sum?.promptTokens ?? 0}
                            </td>
                            <td className="px-6">
                              {row?._sum?.completionTokens ?? 0}
                            </td>
                            <td className="px-6">
                              {row?._sum?.totalTokens ?? 0}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value }) {
  return (
    <div className="rounded-lg border border-white/10 bg-theme-settings-input-bg px-4 py-3">
      <p className="text-xs text-theme-text-secondary">{title}</p>
      <p className="text-sm text-theme-text-primary font-semibold mt-1">
        {Number(value || 0).toLocaleString()}
      </p>
    </div>
  );
}
