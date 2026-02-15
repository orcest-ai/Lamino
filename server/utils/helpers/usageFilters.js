function parseDateLike(value = null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function usageTimeRange(query = {}) {
  const parsedDays = Number(query?.days ?? 30);
  const safeDays = Number.isFinite(parsedDays) && parsedDays > 0 ? parsedDays : 30;
  const to = parseDateLike(query?.to) || new Date();
  const from =
    parseDateLike(query?.from) ||
    new Date(to.getTime() - safeDays * 24 * 60 * 60 * 1000);
  return { from, to };
}

function usageBaseClause(query = {}) {
  const { from, to } = usageTimeRange(query);
  const clause = {
    occurredAt: {
      gte: from,
      lte: to,
    },
  };

  if (query?.userId) clause.userId = Number(query.userId);
  if (query?.workspaceId) clause.workspaceId = Number(query.workspaceId);
  if (query?.teamId) clause.teamId = Number(query.teamId);
  if (query?.eventType) clause.eventType = String(query.eventType);
  if (query?.provider) clause.provider = String(query.provider);
  if (query?.model) clause.model = String(query.model);
  return clause;
}

function timeSeriesBucket(date = new Date(), interval = "day") {
  const iso = new Date(date).toISOString();
  if (interval === "hour") return `${iso.slice(0, 13)}:00`;
  return iso.slice(0, 10);
}

module.exports = {
  usageTimeRange,
  usageBaseClause,
  timeSeriesBucket,
};
