// =====================================================================
// FILE HASIL GENERATE - jangan diedit tangan.
// Sumber: database setelah migrations/*.sql dijalankan.
// Buat ulang: pnpm db:pull   (packages/db/scripts/pull-schema.mjs)
//
// Schema ini hanya untuk query bertipe. Constraint ditegakkan database;
// mis. ON DELETE SET NULL (kolom) tertulis di sini sebagai "set null" saja.
// =====================================================================
import { pgTable, uuid, text, integer, timestamp, date, smallint, boolean, numeric, bigint, jsonb, customType, index, uniqueIndex, foreignKey, primaryKey, unique, check, type PgTableExtraConfigValue } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const articleReferences = pgTable("article_references", {
	id: uuid().default(sql`uuidv7()`).primaryKey(),
	siteId: uuid("site_id").notNull(),
	articleId: uuid("article_id").notNull(),
	position: smallint().notNull(),
	title: text().notNull(),
	url: text().notNull(),
	publisher: text(),
	kind: text().default("ARTICLE").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => [
	foreignKey({
		columns: [table.siteId, table.articleId],
		foreignColumns: [articles.siteId, articles.id],
		name: "fk_article_references_same_site"
	}).onDelete("cascade"),
	uniqueIndex("uq_article_references_position").using("btree", table.articleId.asc().nullsLast(), table.position.asc().nullsLast()),
	uniqueIndex("uq_article_references_url").using("btree", table.articleId.asc().nullsLast(), table.url.asc().nullsLast()),
check("article_references_kind_valid", sql`(kind = ANY (ARRAY['ARTICLE'::text, 'VIDEO'::text, 'IMAGE'::text, 'OTHER'::text]))`),check("article_references_position_positive", sql`("position" > 0)`),check("article_references_publisher_length", sql`((publisher IS NULL) OR ((length(btrim(publisher)) >= 1) AND (length(btrim(publisher)) <= 200)))`),check("article_references_title_length", sql`((length(btrim(title)) >= 1) AND (length(btrim(title)) <= 300))`),check("article_references_url_format", sql`((url ~ '^https?://[^[:space:]]+$'::text) AND (length(url) <= 2048))`),]);

export const articleRevisions = pgTable("article_revisions", {
	id: uuid().default(sql`uuidv7()`).primaryKey(),
	siteId: uuid("site_id").notNull(),
	articleId: uuid("article_id").notNull(),
	revisionNo: integer("revision_no").notNull(),
	snapshot: jsonb().notNull(),
	changeNote: text("change_note"),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => [
	foreignKey({
		columns: [table.createdBy],
		foreignColumns: [users.id],
		name: "article_revisions_created_by_fkey"
	}).onDelete("set null"),
	foreignKey({
		columns: [table.siteId, table.articleId],
		foreignColumns: [articles.siteId, articles.id],
		name: "fk_article_revisions_same_site"
	}).onDelete("cascade"),
	uniqueIndex("uq_article_revisions_article_no").using("btree", table.articleId.asc().nullsLast(), table.revisionNo.asc().nullsLast()),
check("article_revisions_no_positive", sql`(revision_no > 0)`),check("article_revisions_snapshot_obj", sql`(jsonb_typeof(snapshot) = 'object'::text)`),]);

export const articleTags = pgTable("article_tags", {
	siteId: uuid("site_id").notNull(),
	articleId: uuid("article_id").notNull(),
	tagId: uuid("tag_id").notNull(),
	sortOrder: smallint("sort_order").default(0).notNull(),
}, (table) => [
	primaryKey({ columns: [table.articleId, table.tagId], name: "article_tags_pkey"}),
	foreignKey({
		columns: [table.siteId, table.articleId],
		foreignColumns: [articles.siteId, articles.id],
		name: "fk_article_tags_article_same_site"
	}).onDelete("cascade"),
	foreignKey({
		columns: [table.siteId, table.tagId],
		foreignColumns: [tags.siteId, tags.id],
		name: "fk_article_tags_tag_same_site"
	}).onDelete("cascade"),
	index("idx_article_tags_tag").using("btree", table.siteId.asc().nullsLast(), table.tagId.asc().nullsLast()),
]);

export const articles = pgTable("articles", {
	id: uuid().default(sql`uuidv7()`).primaryKey(),
	siteId: uuid("site_id").notNull(),
	categoryId: uuid("category_id").notNull(),
	authorId: uuid("author_id"),
	featuredMediaId: uuid("featured_media_id"),
	title: text().notNull(),
	slug: text().notNull(),
	excerpt: text(),
	body: jsonb().default({"blocks":[],"version":1}).notNull(),
	bodyText: text("body_text").default("").notNull(),
	format: text().default("STANDARD").notNull(),
	status: text().default("DRAFT").notNull(),
	isFeatured: boolean("is_featured").default(false).notNull(),
	publishedAt: timestamp("published_at", { withTimezone: true }),
	seo: jsonb().default({}).notNull(),
	attributes: jsonb().default({}).notNull(),
	version: integer().default(1).notNull(),
	createdBy: uuid("created_by"),
	updatedBy: uuid("updated_by"),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`).notNull(),
	searchVector: customType({ dataType: () => 'tsvector' })("search_vector").generatedAlwaysAs(sql`((setweight(to_tsvector('simple'::regconfig, COALESCE(title, ''::text)), 'A'::"char") || setweight(to_tsvector('simple'::regconfig, COALESCE(excerpt, ''::text)), 'B'::"char")) || setweight(to_tsvector('simple'::regconfig, body_text), 'C'::"char"))`),
}, (table) => [
	foreignKey({
		columns: [table.createdBy],
		foreignColumns: [users.id],
		name: "articles_created_by_fkey"
	}).onDelete("set null"),
	foreignKey({
		columns: [table.siteId],
		foreignColumns: [sites.id],
		name: "articles_site_id_fkey"
	}).onDelete("cascade"),
	foreignKey({
		columns: [table.updatedBy],
		foreignColumns: [users.id],
		name: "articles_updated_by_fkey"
	}).onDelete("set null"),
	foreignKey({
		columns: [table.siteId, table.authorId],
		foreignColumns: [authors.siteId, authors.id],
		name: "fk_articles_author_same_site"
	}).onDelete("set null"),
	foreignKey({
		columns: [table.siteId, table.categoryId],
		foreignColumns: [categories.siteId, categories.id],
		name: "fk_articles_category_same_site"
	}),
	foreignKey({
		columns: [table.siteId, table.featuredMediaId],
		foreignColumns: [media.siteId, media.id],
		name: "fk_articles_media_same_site"
	}).onDelete("set null"),
	index("idx_articles_admin_list").using("btree", table.siteId.asc().nullsLast(), table.status.asc().nullsLast(), table.updatedAt.desc().nullsFirst()),
	index("idx_articles_public_author").using("btree", table.siteId.asc().nullsLast(), table.authorId.asc().nullsLast(), table.publishedAt.desc().nullsFirst()).where(sql`(status = 'PUBLISHED'::text)`),
	index("idx_articles_public_category").using("btree", table.siteId.asc().nullsLast(), table.categoryId.asc().nullsLast(), table.publishedAt.desc().nullsFirst()).where(sql`(status = 'PUBLISHED'::text)`),
	index("idx_articles_public_featured").using("btree", table.siteId.asc().nullsLast(), table.publishedAt.desc().nullsFirst()).where(sql`((status = 'PUBLISHED'::text) AND is_featured)`),
	index("idx_articles_public_feed").using("btree", table.siteId.asc().nullsLast(), table.publishedAt.desc().nullsFirst()).where(sql`(status = 'PUBLISHED'::text)`),
	index("idx_articles_search").using("gin", table.searchVector.asc().nullsLast()),
	uniqueIndex("uq_articles_site_slug").using("btree", table.siteId.asc().nullsLast(), table.slug.asc().nullsLast()),
	unique("articles_site_id_id").on(table.siteId, table.id),check("articles_body_shape", sql`((jsonb_typeof(body) = 'object'::text) AND (jsonb_typeof((body -> 'version'::text)) = 'number'::text) AND (jsonb_typeof((body -> 'blocks'::text)) = 'array'::text))`),check("articles_format_valid", sql`(format = ANY (ARRAY['STANDARD'::text, 'LISTICLE'::text, 'GALLERY'::text, 'VIDEO'::text]))`),check("articles_json_objects", sql`((jsonb_typeof(seo) = 'object'::text) AND (jsonb_typeof(attributes) = 'object'::text))`),check("articles_published_has_date", sql`((status <> 'PUBLISHED'::text) OR (published_at IS NOT NULL))`),check("articles_slug_format", sql`((slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text) AND (length(slug) <= 200))`),check("articles_status_valid", sql`(status = ANY (ARRAY['DRAFT'::text, 'REVIEW'::text, 'PUBLISHED'::text, 'ARCHIVED'::text]))`),check("articles_version_positive", sql`(version > 0)`),]);

export const authors = pgTable("authors", {
	id: uuid().default(sql`uuidv7()`).primaryKey(),
	siteId: uuid("site_id").notNull(),
	userId: uuid("user_id"),
	name: text().notNull(),
	slug: text().notNull(),
	bio: text(),
	avatarMediaId: uuid("avatar_media_id"),
	links: jsonb().default({}).notNull(),
	status: text().default("ACTIVE").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => [
	foreignKey({
		columns: [table.siteId],
		foreignColumns: [sites.id],
		name: "authors_site_id_fkey"
	}).onDelete("cascade"),
	foreignKey({
		columns: [table.siteId, table.avatarMediaId],
		foreignColumns: [media.siteId, media.id],
		name: "fk_authors_avatar"
	}).onDelete("set null"),
	foreignKey({
		columns: [table.siteId, table.userId],
		foreignColumns: [siteMembers.siteId, siteMembers.userId],
		name: "fk_authors_member"
	}).onDelete("set null"),
	uniqueIndex("uq_authors_site_slug").using("btree", table.siteId.asc().nullsLast(), table.slug.asc().nullsLast()),
	uniqueIndex("uq_authors_site_user").using("btree", table.siteId.asc().nullsLast(), table.userId.asc().nullsLast()).where(sql`(user_id IS NOT NULL)`),
	unique("authors_site_id_id").on(table.siteId, table.id),check("authors_links_object", sql`(jsonb_typeof(links) = 'object'::text)`),check("authors_slug_format", sql`((slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text) AND (length(slug) <= 200))`),check("authors_status_valid", sql`(status = ANY (ARRAY['ACTIVE'::text, 'HIDDEN'::text]))`),]);

export const categories = pgTable("categories", {
	id: uuid().default(sql`uuidv7()`).primaryKey(),
	siteId: uuid("site_id").notNull(),
	parentId: uuid("parent_id"),
	name: text().notNull(),
	slug: text().notNull(),
	description: text(),
	sortOrder: integer("sort_order").default(0).notNull(),
	status: text().default("ACTIVE").notNull(),
	seo: jsonb().default({}).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => [
	foreignKey({
		columns: [table.siteId],
		foreignColumns: [sites.id],
		name: "categories_site_id_fkey"
	}).onDelete("cascade"),
	foreignKey({
		columns: [table.siteId, table.parentId],
		foreignColumns: [table.siteId, table.id],
		name: "fk_categories_parent_same_site"
	}),
	index("idx_categories_parent").using("btree", table.siteId.asc().nullsLast(), table.parentId.asc().nullsLast(), table.sortOrder.asc().nullsLast()),
	uniqueIndex("uq_categories_site_slug").using("btree", table.siteId.asc().nullsLast(), table.slug.asc().nullsLast()),
	unique("categories_site_id_id").on(table.siteId, table.id),check("categories_not_own_parent", sql`(parent_id IS DISTINCT FROM id)`),check("categories_seo_object", sql`(jsonb_typeof(seo) = 'object'::text)`),check("categories_slug_format", sql`((slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text) AND (length(slug) <= 200))`),check("categories_status_valid", sql`(status = ANY (ARRAY['ACTIVE'::text, 'HIDDEN'::text]))`),]);

export const generatedArticles = pgTable("generated_articles", {
	id: uuid().default(sql`uuidv7()`).primaryKey(),
	siteId: uuid("site_id").notNull(),
	externalId: text("external_id").notNull(),
	status: text().default("READY_TO_PUBLISH").notNull(),
	payload: jsonb().notNull(),
	agentNote: text("agent_note"),
	generatedAt: timestamp("generated_at", { withTimezone: true }).default(sql`now()`).notNull(),
	reviewNote: text("review_note"),
	reviewedBy: uuid("reviewed_by"),
	reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
	articleId: uuid("article_id"),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => [
	foreignKey({
		columns: [table.siteId, table.articleId],
		foreignColumns: [articles.siteId, articles.id],
		name: "fk_generated_articles_article_same_site"
	}).onDelete("set null"),
	foreignKey({
		columns: [table.reviewedBy],
		foreignColumns: [users.id],
		name: "generated_articles_reviewed_by_fkey"
	}).onDelete("set null"),
	foreignKey({
		columns: [table.siteId],
		foreignColumns: [sites.id],
		name: "generated_articles_site_id_fkey"
	}).onDelete("cascade"),
	index("idx_generated_articles_queue").using("btree", table.siteId.asc().nullsLast(), table.generatedAt.desc().nullsFirst()).where(sql`(status = 'READY_TO_PUBLISH'::text)`),
	uniqueIndex("uq_generated_articles_external").using("btree", table.siteId.asc().nullsLast(), table.externalId.asc().nullsLast()),
check("generated_articles_agent_note_length", sql`((agent_note IS NULL) OR (length(agent_note) <= 5000))`),check("generated_articles_archived_has_note", sql`((status <> 'ARCHIVED'::text) OR (length(btrim(COALESCE(review_note, ''::text))) > 0))`),check("generated_articles_article_only_approved", sql`((article_id IS NULL) OR (status = 'APPROVED'::text))`),check("generated_articles_external_id_length", sql`((length(external_id) >= 1) AND (length(external_id) <= 200))`),check("generated_articles_payload_object", sql`(jsonb_typeof(payload) = 'object'::text)`),check("generated_articles_reviewed_when_decided", sql`((status = 'READY_TO_PUBLISH'::text) = (reviewed_at IS NULL))`),check("generated_articles_status_valid", sql`(status = ANY (ARRAY['READY_TO_PUBLISH'::text, 'APPROVED'::text, 'ARCHIVED'::text]))`),]);

export const media = pgTable("media", {
	id: uuid().default(sql`uuidv7()`).primaryKey(),
	siteId: uuid("site_id").notNull(),
	storageKey: text("storage_key").notNull(),
	mimeType: text("mime_type").notNull(),
	sizeBytes: bigint("size_bytes", { mode: 'number' }).notNull(),
	width: integer(),
	height: integer(),
	altText: text("alt_text"),
	caption: text(),
	credit: text(),
	focalX: numeric("focal_x", { mode: 'number', precision: 4, scale: 3 }).default(0.5).notNull(),
	focalY: numeric("focal_y", { mode: 'number', precision: 4, scale: 3 }).default(0.5).notNull(),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`).notNull(),
	sourceUrl: text("source_url"),
}, (table): PgTableExtraConfigValue[] => [
	foreignKey({
		columns: [table.createdBy],
		foreignColumns: [users.id],
		name: "media_created_by_fkey"
	}).onDelete("set null"),
	foreignKey({
		columns: [table.siteId],
		foreignColumns: [sites.id],
		name: "media_site_id_fkey"
	}).onDelete("cascade"),
	index("idx_media_site_created").using("btree", table.siteId.asc().nullsLast(), table.createdAt.desc().nullsFirst()),
	uniqueIndex("uq_media_storage_key").using("btree", table.storageKey.asc().nullsLast()),
	unique("media_site_id_id").on(table.siteId, table.id),check("media_dimensions", sql`(((width IS NULL) = (height IS NULL)) AND ((width IS NULL) OR ((width > 0) AND (height > 0))))`),check("media_focal_range", sql`(((focal_x >= (0)::numeric) AND (focal_x <= (1)::numeric)) AND ((focal_y >= (0)::numeric) AND (focal_y <= (1)::numeric)))`),check("media_size_positive", sql`(size_bytes > 0)`),check("media_source_url_format", sql`((source_url IS NULL) OR ((source_url ~ '^https?://[^[:space:]]+$'::text) AND (length(source_url) <= 2048)))`),]);

export const menuItems = pgTable("menu_items", {
	id: uuid().default(sql`uuidv7()`).primaryKey(),
	siteId: uuid("site_id").notNull(),
	menuId: uuid("menu_id").notNull(),
	parentId: uuid("parent_id"),
	label: text().notNull(),
	itemType: text("item_type").notNull(),
	categoryId: uuid("category_id"),
	articleId: uuid("article_id"),
	pageId: uuid("page_id"),
	tagId: uuid("tag_id"),
	url: text(),
	openInNewTab: boolean("open_in_new_tab").default(false).notNull(),
	sortOrder: integer("sort_order").default(0).notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => [
	foreignKey({
		columns: [table.siteId, table.articleId],
		foreignColumns: [articles.siteId, articles.id],
		name: "fk_menu_items_article"
	}).onDelete("cascade"),
	foreignKey({
		columns: [table.siteId, table.categoryId],
		foreignColumns: [categories.siteId, categories.id],
		name: "fk_menu_items_category"
	}).onDelete("cascade"),
	foreignKey({
		columns: [table.siteId, table.menuId],
		foreignColumns: [menus.siteId, menus.id],
		name: "fk_menu_items_menu_same_site"
	}).onDelete("cascade"),
	foreignKey({
		columns: [table.siteId, table.pageId],
		foreignColumns: [pages.siteId, pages.id],
		name: "fk_menu_items_page"
	}).onDelete("cascade"),
	foreignKey({
		columns: [table.menuId, table.parentId],
		foreignColumns: [table.menuId, table.id],
		name: "fk_menu_items_parent_same_menu"
	}).onDelete("cascade"),
	foreignKey({
		columns: [table.siteId, table.tagId],
		foreignColumns: [tags.siteId, tags.id],
		name: "fk_menu_items_tag"
	}).onDelete("cascade"),
	index("idx_menu_items_tree").using("btree", table.menuId.asc().nullsLast(), table.parentId.asc().nullsLast(), table.sortOrder.asc().nullsLast()),
	unique("menu_items_menu_id_id").on(table.menuId, table.id),check("menu_items_not_own_parent", sql`(parent_id IS DISTINCT FROM id)`),check("menu_items_target_matches", sql`(((item_type = 'CATEGORY'::text) = (category_id IS NOT NULL)) AND ((item_type = 'ARTICLE'::text) = (article_id IS NOT NULL)) AND ((item_type = 'PAGE'::text) = (page_id IS NOT NULL)) AND ((item_type = 'TAG'::text) = (tag_id IS NOT NULL)) AND ((item_type = ANY (ARRAY['URL'::text, 'ROUTE'::text])) = (url IS NOT NULL)))`),check("menu_items_type_valid", sql`(item_type = ANY (ARRAY['CATEGORY'::text, 'ARTICLE'::text, 'PAGE'::text, 'TAG'::text, 'URL'::text, 'ROUTE'::text]))`),check("menu_items_url_safe", sql`((url IS NULL) OR ((item_type = 'URL'::text) AND (url ~ '^https?://[^[:space:]]+$'::text)) OR ((item_type = 'ROUTE'::text) AND (url ~ '^/[^[:space:]]*$'::text) AND (url !~ '^//'::text)))`),]);

export const menus = pgTable("menus", {
	id: uuid().default(sql`uuidv7()`).primaryKey(),
	siteId: uuid("site_id").notNull(),
	location: text().notNull(),
	name: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => [
	foreignKey({
		columns: [table.siteId],
		foreignColumns: [sites.id],
		name: "menus_site_id_fkey"
	}).onDelete("cascade"),
	uniqueIndex("uq_menus_site_location").using("btree", table.siteId.asc().nullsLast(), table.location.asc().nullsLast()),
	unique("menus_site_id_id").on(table.siteId, table.id),check("menus_location_format", sql`(location ~ '^[a-z0-9]+(_[a-z0-9]+)*$'::text)`),]);

export const pages = pgTable("pages", {
	id: uuid().default(sql`uuidv7()`).primaryKey(),
	siteId: uuid("site_id").notNull(),
	title: text().notNull(),
	slug: text().notNull(),
	body: jsonb().default({"blocks":[],"version":1}).notNull(),
	viewKey: text("view_key").default("default").notNull(),
	status: text().default("DRAFT").notNull(),
	publishedAt: timestamp("published_at", { withTimezone: true }),
	seo: jsonb().default({}).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => [
	foreignKey({
		columns: [table.siteId],
		foreignColumns: [sites.id],
		name: "pages_site_id_fkey"
	}).onDelete("cascade"),
	uniqueIndex("uq_pages_site_slug").using("btree", table.siteId.asc().nullsLast(), table.slug.asc().nullsLast()),
	unique("pages_site_id_id").on(table.siteId, table.id),check("pages_body_shape", sql`((jsonb_typeof(body) = 'object'::text) AND (jsonb_typeof((body -> 'version'::text)) = 'number'::text) AND (jsonb_typeof((body -> 'blocks'::text)) = 'array'::text))`),check("pages_published_has_date", sql`((status <> 'PUBLISHED'::text) OR (published_at IS NOT NULL))`),check("pages_seo_object", sql`(jsonb_typeof(seo) = 'object'::text)`),check("pages_slug_format", sql`((slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text) AND (length(slug) <= 200))`),check("pages_status_valid", sql`(status = ANY (ARRAY['DRAFT'::text, 'PUBLISHED'::text, 'ARCHIVED'::text]))`),check("pages_view_key_format", sql`(view_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text)`),]);

export const redirects = pgTable("redirects", {
	id: uuid().default(sql`uuidv7()`).primaryKey(),
	siteId: uuid("site_id").notNull(),
	fromPath: text("from_path").notNull(),
	toPath: text("to_path").notNull(),
	statusCode: smallint("status_code").default(301).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => [
	foreignKey({
		columns: [table.siteId],
		foreignColumns: [sites.id],
		name: "redirects_site_id_fkey"
	}).onDelete("cascade"),
	uniqueIndex("uq_redirects_site_from").using("btree", table.siteId.asc().nullsLast(), table.fromPath.asc().nullsLast()),
check("redirects_from_path", sql`((from_path ~ '^/[^[:space:]]*$'::text) AND (from_path !~ '^//'::text))`),check("redirects_not_self", sql`(from_path <> to_path)`),check("redirects_status_valid", sql`(status_code = ANY (ARRAY[301, 302, 307, 308]))`),check("redirects_to_path", sql`(((to_path ~ '^/[^[:space:]]*$'::text) AND (to_path !~ '^//'::text)) OR (to_path ~ '^https?://[^[:space:]]+$'::text))`),]);

export const revenueFxRates = pgTable("revenue_fx_rates", {
	currency: text().notNull(),
	baseCurrency: text("base_currency").notNull(),
	rateDate: date("rate_date").notNull(),
	rateToBase: numeric("rate_to_base", { precision: 20, scale: 8 }).notNull(),
	note: text(),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => [
	primaryKey({ columns: [table.currency, table.baseCurrency, table.rateDate], name: "revenue_fx_rates_pkey"}),
	foreignKey({
		columns: [table.createdBy],
		foreignColumns: [users.id],
		name: "revenue_fx_rates_created_by_fkey"
	}).onDelete("set null"),
check("revenue_fx_rates_currency_format", sql`((currency ~ '^[A-Z]{3}$'::text) AND (base_currency ~ '^[A-Z]{3}$'::text))`),check("revenue_fx_rates_not_same", sql`(currency <> base_currency)`),check("revenue_fx_rates_positive", sql`(rate_to_base > (0)::numeric)`),]);

export const revenueImportBatches = pgTable("revenue_import_batches", {
	id: uuid().default(sql`uuidv7()`).primaryKey(),
	sourceId: uuid("source_id").notNull(),
	fileName: text("file_name").notNull(),
	fileFormat: text("file_format").notNull(),
	fileSha256: text("file_sha256").notNull(),
	status: text().default("uploaded").notNull(),
	rowCount: integer("row_count").default(0).notNull(),
	headers: jsonb().default([]).notNull(),
	rows: jsonb(),
	mapping: jsonb(),
	inserted: integer().default(0).notNull(),
	updated: integer().default(0).notNull(),
	unchanged: integer().default(0).notNull(),
	skipped: integer().default(0).notNull(),
	failed: integer().default(0).notNull(),
	errors: jsonb().default([]).notNull(),
	createdBy: uuid("created_by"),
	committedAt: timestamp("committed_at", { withTimezone: true }),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => [
	foreignKey({
		columns: [table.createdBy],
		foreignColumns: [users.id],
		name: "revenue_import_batches_created_by_fkey"
	}).onDelete("set null"),
	foreignKey({
		columns: [table.sourceId],
		foreignColumns: [revenueSources.id],
		name: "revenue_import_batches_source_id_fkey"
	}).onDelete("cascade"),
	index("idx_revenue_import_batches_source").using("btree", table.sourceId.asc().nullsLast(), table.createdAt.desc().nullsFirst()),
check("revenue_import_batches_committed", sql`((status = 'committed'::text) = (committed_at IS NOT NULL))`),check("revenue_import_batches_format_valid", sql`(file_format = ANY (ARRAY['csv'::text, 'xlsx'::text, 'json'::text]))`),check("revenue_import_batches_name_length", sql`((length(file_name) >= 1) AND (length(file_name) <= 255))`),check("revenue_import_batches_rows_pending", sql`((status = 'uploaded'::text) OR (rows IS NULL))`),check("revenue_import_batches_status_valid", sql`(status = ANY (ARRAY['uploaded'::text, 'committed'::text, 'failed'::text, 'discarded'::text]))`),]);

export const revenueLedgerEntries = pgTable("revenue_ledger_entries", {
	id: uuid().default(sql`uuidv7()`).primaryKey(),
	sourceId: uuid("source_id").notNull(),
	propertyId: uuid("property_id"),
	channelType: text("channel_type").notNull(),
	idempotencyKey: text("idempotency_key").notNull(),
	externalId: text("external_id"),
	occurredAt: timestamp("occurred_at", { withTimezone: true }),
	reportDate: date("report_date").notNull(),
	grossAmount: numeric("gross_amount", { precision: 20, scale: 6 }).notNull(),
	currency: text().notNull(),
	fxRateToBase: numeric("fx_rate_to_base", { precision: 20, scale: 8 }),
	baseCurrency: text("base_currency").notNull(),
	normalizedAmount: numeric("normalized_amount", { precision: 20, scale: 2 }),
	status: text().notNull(),
	metricsJson: jsonb("metrics_json").default({}).notNull(),
	dimensions: jsonb().default({}).notNull(),
	description: text(),
	note: text(),
	rawPayload: jsonb("raw_payload"),
	adjustsEntryId: uuid("adjusts_entry_id"),
	syncRunId: uuid("sync_run_id"),
	importBatchId: uuid("import_batch_id"),
	webhookEventId: uuid("webhook_event_id"),
	createdBy: uuid("created_by"),
	revision: integer().default(1).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`).notNull(),
}, (table): PgTableExtraConfigValue[] => [
	foreignKey({
		columns: [table.adjustsEntryId],
		foreignColumns: [table.id],
		name: "revenue_ledger_entries_adjusts_entry_id_fkey"
	}).onDelete("set null"),
	foreignKey({
		columns: [table.createdBy],
		foreignColumns: [users.id],
		name: "revenue_ledger_entries_created_by_fkey"
	}).onDelete("set null"),
	foreignKey({
		columns: [table.importBatchId],
		foreignColumns: [revenueImportBatches.id],
		name: "revenue_ledger_entries_import_batch_id_fkey"
	}).onDelete("set null"),
	foreignKey({
		columns: [table.propertyId],
		foreignColumns: [revenueProperties.id],
		name: "revenue_ledger_entries_property_id_fkey"
	}).onDelete("set null"),
	foreignKey({
		columns: [table.sourceId],
		foreignColumns: [revenueSources.id],
		name: "revenue_ledger_entries_source_id_fkey"
	}).onDelete("restrict"),
	foreignKey({
		columns: [table.syncRunId],
		foreignColumns: [revenueSyncRuns.id],
		name: "revenue_ledger_entries_sync_run_id_fkey"
	}).onDelete("set null"),
	foreignKey({
		columns: [table.webhookEventId],
		foreignColumns: [revenueWebhookEvents.id],
		name: "revenue_ledger_entries_webhook_event_id_fkey"
	}).onDelete("set null"),
	index("idx_revenue_ledger_date").using("btree", table.reportDate.asc().nullsLast()),
	index("idx_revenue_ledger_property_date").using("btree", table.propertyId.asc().nullsLast(), table.reportDate.asc().nullsLast()),
	index("idx_revenue_ledger_recent").using("btree", table.updatedAt.desc().nullsFirst()),
	index("idx_revenue_ledger_source_date").using("btree", table.sourceId.asc().nullsLast(), table.reportDate.asc().nullsLast()),
	index("idx_revenue_ledger_unconverted").using("btree", table.currency.asc().nullsLast(), table.reportDate.asc().nullsLast()).where(sql`(normalized_amount IS NULL)`),
	uniqueIndex("uq_revenue_ledger_key").using("btree", table.sourceId.asc().nullsLast(), table.idempotencyKey.asc().nullsLast()),
check("revenue_ledger_channel_valid", sql`(channel_type = ANY (ARRAY['webhook'::text, 'api'::text, 'csv_import'::text, 'headless'::text, 'manual'::text]))`),check("revenue_ledger_currency_format", sql`((currency ~ '^[A-Z]{3}$'::text) AND (base_currency ~ '^[A-Z]{3}$'::text))`),check("revenue_ledger_description_len", sql`((description IS NULL) OR (length(description) <= 500))`),check("revenue_ledger_fx_pair", sql`((fx_rate_to_base IS NULL) = (normalized_amount IS NULL))`),check("revenue_ledger_fx_positive", sql`((fx_rate_to_base IS NULL) OR (fx_rate_to_base > (0)::numeric))`),check("revenue_ledger_fx_same_ccy", sql`((currency <> base_currency) OR (fx_rate_to_base = (1)::numeric))`),check("revenue_ledger_key_length", sql`((length(idempotency_key) >= 1) AND (length(idempotency_key) <= 300))`),check("revenue_ledger_metrics_object", sql`((jsonb_typeof(metrics_json) = 'object'::text) AND (jsonb_typeof(dimensions) = 'object'::text))`),check("revenue_ledger_note_len", sql`((note IS NULL) OR (length(note) <= 2000))`),check("revenue_ledger_note_required", sql`((status <> ALL (ARRAY['adjusted'::text, 'refunded'::text])) OR (length(btrim(COALESCE(note, ''::text))) > 0))`),check("revenue_ledger_refund_negative", sql`((status <> 'refunded'::text) OR (gross_amount < (0)::numeric))`),check("revenue_ledger_revision_pos", sql`(revision >= 1)`),check("revenue_ledger_status_valid", sql`(status = ANY (ARRAY['estimated'::text, 'finalized'::text, 'adjusted'::text, 'refunded'::text]))`),]);

export const revenueLedgerRevisions = pgTable("revenue_ledger_revisions", {
	id: uuid().default(sql`uuidv7()`).primaryKey(),
	entryId: uuid("entry_id").notNull(),
	revision: integer().notNull(),
	grossAmount: numeric("gross_amount", { precision: 20, scale: 6 }).notNull(),
	currency: text().notNull(),
	fxRateToBase: numeric("fx_rate_to_base", { precision: 20, scale: 8 }),
	normalizedAmount: numeric("normalized_amount", { precision: 20, scale: 2 }),
	status: text().notNull(),
	metricsJson: jsonb("metrics_json").notNull(),
	syncRunId: uuid("sync_run_id"),
	importBatchId: uuid("import_batch_id"),
	replacedAt: timestamp("replaced_at", { withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => [
	foreignKey({
		columns: [table.entryId],
		foreignColumns: [revenueLedgerEntries.id],
		name: "revenue_ledger_revisions_entry_id_fkey"
	}).onDelete("cascade"),
	uniqueIndex("uq_revenue_ledger_revisions").using("btree", table.entryId.asc().nullsLast(), table.revision.asc().nullsLast()),
]);

export const revenueProperties = pgTable("revenue_properties", {
	id: uuid().default(sql`uuidv7()`).primaryKey(),
	code: text().notNull(),
	name: text().notNull(),
	domain: text(),
	linkedSiteId: uuid("linked_site_id"),
	status: text().default("ACTIVE").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => [
	foreignKey({
		columns: [table.linkedSiteId],
		foreignColumns: [sites.id],
		name: "revenue_properties_linked_site_id_fkey"
	}).onDelete("set null"),
	uniqueIndex("uq_revenue_properties_code").using("btree", table.code.asc().nullsLast()),
	uniqueIndex("uq_revenue_properties_domain").using("btree", table.domain.asc().nullsLast()).where(sql`(domain IS NOT NULL)`),
check("revenue_properties_code_format", sql`((code ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text) AND (length(code) <= 50))`),check("revenue_properties_domain_format", sql`((domain IS NULL) OR ((domain = lower(domain)) AND (domain ~ '^[a-z0-9.-]+$'::text) AND (domain !~ '^www\\.'::text) AND (length(domain) <= 253)))`),check("revenue_properties_name_length", sql`((length(btrim(name)) >= 1) AND (length(btrim(name)) <= 120))`),check("revenue_properties_status_valid", sql`(status = ANY (ARRAY['ACTIVE'::text, 'ARCHIVED'::text]))`),]);

export const revenueSources = pgTable("revenue_sources", {
	id: uuid().default(sql`uuidv7()`).primaryKey(),
	code: text().notNull(),
	name: text().notNull(),
	connector: text().default("generic").notNull(),
	integrationType: text("integration_type").default("manual").notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	defaultCurrency: text("default_currency").default("IDR").notNull(),
	config: jsonb().default({}).notNull(),
	credentialsEnv: text("credentials_env"),
	syncIntervalMinutes: integer("sync_interval_minutes"),
	lookbackDays: smallint("lookback_days").default(3).notNull(),
	sortOrder: smallint("sort_order").default(0).notNull(),
	lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
	lastSyncStatus: text("last_sync_status"),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => [
	uniqueIndex("uq_revenue_sources_code").using("btree", table.code.asc().nullsLast()),
check("revenue_sources_code_format", sql`((code ~ '^[a-z0-9]+(_[a-z0-9]+)*$'::text) AND (length(code) <= 40))`),check("revenue_sources_config_object", sql`(jsonb_typeof(config) = 'object'::text)`),check("revenue_sources_connector_valid", sql`(connector = ANY (ARRAY['lynk'::text, 'adsterra'::text, 'adsense'::text, 'headless'::text, 'generic'::text]))`),check("revenue_sources_credentials_env", sql`((credentials_env IS NULL) OR (credentials_env ~ '^[A-Z][A-Z0-9_]{1,60}$'::text))`),check("revenue_sources_currency_format", sql`(default_currency ~ '^[A-Z]{3}$'::text)`),check("revenue_sources_interval_range", sql`((sync_interval_minutes IS NULL) OR ((sync_interval_minutes >= 15) AND (sync_interval_minutes <= 10080)))`),check("revenue_sources_lookback_range", sql`((lookback_days >= 0) AND (lookback_days <= 60))`),check("revenue_sources_name_length", sql`((length(btrim(name)) >= 1) AND (length(btrim(name)) <= 80))`),check("revenue_sources_sync_status", sql`((last_sync_status IS NULL) OR (last_sync_status = ANY (ARRAY['success'::text, 'partial'::text, 'failed'::text])))`),check("revenue_sources_type_valid", sql`(integration_type = ANY (ARRAY['webhook'::text, 'api'::text, 'csv_import'::text, 'headless'::text, 'manual'::text]))`),]);

export const revenueSyncRuns = pgTable("revenue_sync_runs", {
	id: uuid().default(sql`uuidv7()`).primaryKey(),
	sourceId: uuid("source_id").notNull(),
	channelType: text("channel_type").notNull(),
	trigger: text().notNull(),
	status: text().default("running").notNull(),
	mock: boolean().default(false).notNull(),
	rangeStart: date("range_start").notNull(),
	rangeEnd: date("range_end").notNull(),
	startedAt: timestamp("started_at", { withTimezone: true }).default(sql`now()`).notNull(),
	finishedAt: timestamp("finished_at", { withTimezone: true }),
	rowsFetched: integer("rows_fetched").default(0).notNull(),
	inserted: integer().default(0).notNull(),
	updated: integer().default(0).notNull(),
	unchanged: integer().default(0).notNull(),
	skipped: integer().default(0).notNull(),
	failed: integer().default(0).notNull(),
	errorMessage: text("error_message"),
	log: jsonb().default([]).notNull(),
	triggeredBy: uuid("triggered_by"),
}, (table) => [
	foreignKey({
		columns: [table.sourceId],
		foreignColumns: [revenueSources.id],
		name: "revenue_sync_runs_source_id_fkey"
	}).onDelete("cascade"),
	foreignKey({
		columns: [table.triggeredBy],
		foreignColumns: [users.id],
		name: "revenue_sync_runs_triggered_by_fkey"
	}).onDelete("set null"),
	index("idx_revenue_sync_runs_source").using("btree", table.sourceId.asc().nullsLast(), table.startedAt.desc().nullsFirst()),
	uniqueIndex("uq_revenue_sync_runs_running").using("btree", table.sourceId.asc().nullsLast()).where(sql`(status = 'running'::text)`),
check("revenue_sync_runs_channel_valid", sql`(channel_type = ANY (ARRAY['api'::text, 'headless'::text]))`),check("revenue_sync_runs_finished", sql`((status = 'running'::text) = (finished_at IS NULL))`),check("revenue_sync_runs_log_array", sql`(jsonb_typeof(log) = 'array'::text)`),check("revenue_sync_runs_range_valid", sql`(range_start <= range_end)`),check("revenue_sync_runs_status_valid", sql`(status = ANY (ARRAY['running'::text, 'success'::text, 'partial'::text, 'failed'::text]))`),check("revenue_sync_runs_trigger_valid", sql`(trigger = ANY (ARRAY['schedule'::text, 'manual'::text, 'cli'::text]))`),]);

export const revenueWebhookEvents = pgTable("revenue_webhook_events", {
	id: uuid().default(sql`uuidv7()`).primaryKey(),
	sourceId: uuid("source_id").notNull(),
	receivedAt: timestamp("received_at", { withTimezone: true }).default(sql`now()`).notNull(),
	eventType: text("event_type"),
	externalEventId: text("external_event_id"),
	signatureValid: boolean("signature_valid").notNull(),
	status: text().notNull(),
	ledgerEntryId: uuid("ledger_entry_id"),
	error: text(),
	payload: jsonb(),
	test: boolean().default(false).notNull(),
}, (table): PgTableExtraConfigValue[] => [
	foreignKey({
		columns: [table.ledgerEntryId],
		foreignColumns: [revenueLedgerEntries.id],
		name: "fk_revenue_webhook_events_entry"
	}).onDelete("set null"),
	foreignKey({
		columns: [table.sourceId],
		foreignColumns: [revenueSources.id],
		name: "revenue_webhook_events_source_id_fkey"
	}).onDelete("cascade"),
	index("idx_revenue_webhook_events_source").using("btree", table.sourceId.asc().nullsLast(), table.receivedAt.desc().nullsFirst()),
check("revenue_webhook_events_payload_signed", sql`((payload IS NULL) OR signature_valid)`),check("revenue_webhook_events_status_valid", sql`(status = ANY (ARRAY['processed'::text, 'duplicate'::text, 'ignored'::text, 'rejected'::text, 'failed'::text]))`),]);

export const siteDomains = pgTable("site_domains", {
	id: uuid().default(sql`uuidv7()`).primaryKey(),
	siteId: uuid("site_id").notNull(),
	domain: text().notNull(),
	isPrimary: boolean("is_primary").default(false).notNull(),
	status: text().default("ACTIVE").notNull(),
	verifiedAt: timestamp("verified_at", { withTimezone: true }),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => [
	foreignKey({
		columns: [table.siteId],
		foreignColumns: [sites.id],
		name: "site_domains_site_id_fkey"
	}).onDelete("cascade"),
	index("idx_site_domains_site").using("btree", table.siteId.asc().nullsLast()),
	uniqueIndex("uq_site_domains_domain").using("btree", table.domain.asc().nullsLast()),
	uniqueIndex("uq_site_domains_one_primary").using("btree", table.siteId.asc().nullsLast()).where(sql`is_primary`),
check("site_domains_domain_format", sql`((domain = lower(domain)) AND (length(domain) <= 253) AND (domain ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'::text))`),check("site_domains_status_valid", sql`(status = ANY (ARRAY['PENDING'::text, 'ACTIVE'::text, 'DISABLED'::text]))`),]);

export const siteMembers = pgTable("site_members", {
	siteId: uuid("site_id").notNull(),
	userId: uuid("user_id").notNull(),
	role: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => [
	primaryKey({ columns: [table.siteId, table.userId], name: "site_members_pkey"}),
	foreignKey({
		columns: [table.siteId],
		foreignColumns: [sites.id],
		name: "site_members_site_id_fkey"
	}).onDelete("cascade"),
	foreignKey({
		columns: [table.userId],
		foreignColumns: [users.id],
		name: "site_members_user_id_fkey"
	}).onDelete("cascade"),
	index("idx_site_members_user").using("btree", table.userId.asc().nullsLast()),
check("site_members_role_valid", sql`(role = ANY (ARRAY['OWNER'::text, 'EDITOR'::text, 'AUTHOR'::text]))`),]);

export const siteThemes = pgTable("site_themes", {
	id: uuid().default(sql`uuidv7()`).primaryKey(),
	siteId: uuid("site_id").notNull(),
	templateKey: text("template_key").notNull(),
	templateVersion: text("template_version").notNull(),
	tokens: jsonb().default({}).notNull(),
	options: jsonb().default({}).notNull(),
	layouts: jsonb().default({}).notNull(),
	isActive: boolean("is_active").default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => [
	foreignKey({
		columns: [table.siteId],
		foreignColumns: [sites.id],
		name: "site_themes_site_id_fkey"
	}).onDelete("cascade"),
	uniqueIndex("uq_site_themes_one_active").using("btree", table.siteId.asc().nullsLast()).where(sql`is_active`),
	uniqueIndex("uq_site_themes_site_template").using("btree", table.siteId.asc().nullsLast(), table.templateKey.asc().nullsLast()),
check("site_themes_json_objects", sql`((jsonb_typeof(tokens) = 'object'::text) AND (jsonb_typeof(options) = 'object'::text) AND (jsonb_typeof(layouts) = 'object'::text))`),check("site_themes_key_format", sql`(template_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text)`),check("site_themes_version_semver", sql`(template_version ~ '^[0-9]+\\.[0-9]+\\.[0-9]+$'::text)`),]);

export const sites = pgTable("sites", {
	id: uuid().default(sql`uuidv7()`).primaryKey(),
	code: text().notNull(),
	name: text().notNull(),
	status: text().default("ACTIVE").notNull(),
	defaultLocale: text("default_locale").default("id-ID").notNull(),
	timezone: text().default("Asia/Jakarta").notNull(),
	settings: jsonb().default({}).notNull(),
	logoMediaId: uuid("logo_media_id"),
	faviconMediaId: uuid("favicon_media_id"),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`).notNull(),
}, (table): PgTableExtraConfigValue[] => [
	foreignKey({
		columns: [table.id, table.faviconMediaId],
		foreignColumns: [media.siteId, media.id],
		name: "fk_sites_favicon_same_site"
	}).onDelete("set null"),
	foreignKey({
		columns: [table.id, table.logoMediaId],
		foreignColumns: [media.siteId, media.id],
		name: "fk_sites_logo_same_site"
	}).onDelete("set null"),
	uniqueIndex("uq_sites_code").using("btree", table.code.asc().nullsLast()),
check("sites_code_format", sql`((code ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text) AND (length(code) <= 50))`),check("sites_settings_object", sql`(jsonb_typeof(settings) = 'object'::text)`),check("sites_status_valid", sql`(status = ANY (ARRAY['ACTIVE'::text, 'SUSPENDED'::text, 'ARCHIVED'::text]))`),]);

export const tags = pgTable("tags", {
	id: uuid().default(sql`uuidv7()`).primaryKey(),
	siteId: uuid("site_id").notNull(),
	name: text().notNull(),
	slug: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => [
	foreignKey({
		columns: [table.siteId],
		foreignColumns: [sites.id],
		name: "tags_site_id_fkey"
	}).onDelete("cascade"),
	uniqueIndex("uq_tags_site_slug").using("btree", table.siteId.asc().nullsLast(), table.slug.asc().nullsLast()),
	unique("tags_site_id_id").on(table.siteId, table.id),check("tags_slug_format", sql`((slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text) AND (length(slug) <= 200))`),]);

export const users = pgTable("users", {
	id: uuid().default(sql`uuidv7()`).primaryKey(),
	email: text().notNull(),
	passwordHash: text("password_hash"),
	displayName: text("display_name").notNull(),
	isSuperadmin: boolean("is_superadmin").default(false).notNull(),
	status: text().default("ACTIVE").notNull(),
	lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
	createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => [
	uniqueIndex("uq_users_email").using("btree", table.email.asc().nullsLast()),
check("users_email_normalized", sql`((email = lower(email)) AND (POSITION(('@'::text) IN (email)) > 1))`),check("users_status_valid", sql`(status = ANY (ARRAY['ACTIVE'::text, 'DISABLED'::text]))`),]);
