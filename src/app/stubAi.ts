// The browser battle's enemy brain is the real one, in `src/core/ai`. This
// module is kept only as the import site `src/app` and its tests already use.

export { enemyCommand as stubAiCommand, chooseCommand } from "../core/ai/index.js";
