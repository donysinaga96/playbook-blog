// =====================================================================
// FILE HASIL GENERATE - jangan diedit tangan.
// Sumber: database setelah migrations/*.sql dijalankan.
// Buat ulang: pnpm db:pull   (packages/db/scripts/pull-schema.mjs)
//
// Schema ini hanya untuk query bertipe. Constraint ditegakkan database;
// mis. ON DELETE SET NULL (kolom) tertulis di sini sebagai "set null" saja.
// =====================================================================
import { pgTable, uuid, text, integer, boolean, timestamp, smallint, jsonb, bigint, numeric, customType, index, uniqueIndex, foreignKey, primaryKey, unique, check, type PgTableExtraConfigValue } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



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
	unique("media_site_id_id").on(table.siteId, table.id),check("media_dimensions", sql`(((width IS NULL) = (height IS NULL)) AND ((width IS NULL) OR ((width > 0) AND (height > 0))))`),check("media_focal_range", sql`(((focal_x >= (0)::numeric) AND (focal_x <= (1)::numeric)) AND ((focal_y >= (0)::numeric) AND (focal_y <= (1)::numeric)))`),check("media_size_positive", sql`(size_bytes > 0)`),]);

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
