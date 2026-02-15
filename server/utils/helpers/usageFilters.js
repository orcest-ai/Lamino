function parseDateLike(value = null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseIdFilter(value = null) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.trunc(parsed);
}

function parseStringFilter(value = null) {
  if (value === null || value === undefined) return null;
  const parsed = String(value).trim();
  return parsed.length > 0 ? parsed : null;
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

  const userId = parseIdFilter(query?.userId);
  const workspaceId = parseIdFilter(query?.workspaceId);
  const teamId = parseIdFilter(query?.teamId);
  const eventType = parseStringFilter(query?.eventType);
  const provider = parseStringFilter(query?.provider);
  const model = parseStringFilter(query?.model);

  if (userId !== null) clause.userId = userId;
  if (workspaceId !== null) clause.workspaceId = workspaceId;
  if (teamId !== null) clause.teamId = teamId;
  if (eventType) clause.eventType = eventType;
  if (provider) clause.provider = provider;
  if (model) clause.model = model;
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
