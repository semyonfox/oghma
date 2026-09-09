import type postgres from 'postgres';

// These are the tables/columns the <=017 adoption path assumes already exist.
// A fresh database must use the documented bootstrap, never fake its history.
const legacyColumns = {
  login: ['user_id'],
  oauth_accounts: ['user_id', 'provider', 'provider_id'],
  notes: ['note_id', 'user_id', 'deleted_at', 'extracted_text', 'canvas_course_id'],
  tree_items: ['user_id', 'note_id', 'parent_id'],
  attachments: ['id', 'note_id', 'user_id'],
  pdf_annotations: ['user_id', 'note_id', 'attachment_id'],
  chunks: ['id', 'document_id', 'user_id', 'text'],
  chat_sessions: ['id', 'user_id', 'context'],
  chat_messages: ['id', 'session_id', 'content'],
  canvas_import_jobs: ['id', 'user_id', 'status'],
  canvas_imports: ['id', 'user_id', 'job_id'],
  quiz_questions: ['id', 'user_id', 'chunk_id'],
  quiz_cards: ['id', 'user_id', 'question_id', 'due'],
  quiz_sessions: ['id', 'user_id', 'card_ids'],
  quiz_reviews: ['id', 'user_id', 'question_id'],
  user_streaks: ['user_id'],
  user_course_settings: ['user_id', 'canvas_course_id'],
};

export async function assertLegacySchema(sql: postgres.Sql | postgres.TransactionSql): Promise<void> {
  const rows = await sql<{ table_name: string; column_name: string }[]>`
    SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'app'
  `;
  const present = new Set(rows.map(row => `${row.table_name}.${row.column_name}`));
  const missing = Object.entries(legacyColumns).flatMap(([table, columns]) =>
    columns.filter(column => !present.has(`${table}.${column}`)).map(column => `${table}.${column}`),
  );
  if (missing.length) throw new Error(`Cannot adopt legacy migration history; missing schema: ${missing.join(', ')}`);
}
