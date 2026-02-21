export const ACTIONS = {
  SUMMARIZE: "summarize",
  EXPLAIN: "explain",
  BOOKMARK: "bookmark",
  PROMPT: "prompt"
};

export function actionLabel(action) {
  if (action === ACTIONS.SUMMARIZE) return "Summarize";
  if (action === ACTIONS.EXPLAIN) return "Explain";
  if (action === ACTIONS.BOOKMARK) return "Bookmark";
  if (action === ACTIONS.PROMPT) return "Prompt";
  return "Action";
}
