// =====================================================================
// FILE HASIL GENERATE - jangan diedit tangan.
// Sumber: database setelah migrations/*.sql dijalankan.
// Buat ulang: pnpm db:pull   (packages/db/scripts/pull-schema.mjs)
//
// Schema ini hanya untuk query bertipe. Constraint ditegakkan database;
// mis. ON DELETE SET NULL (kolom) tertulis di sini sebagai "set null" saja.
// =====================================================================
import { defineRelations } from "drizzle-orm";
import * as schema from "./schema";

export const relations = defineRelations(schema, (r) => ({
	users: {
		articlesViaArticleRevisions: r.many.articles({
			from: r.users.id.through(r.articleRevisions.createdBy),
			to: [r.articles.siteId.through(r.articleRevisions.siteId), r.articles.id.through(r.articleRevisions.articleId)],
			alias: "users_id_articles_siteId_id_via_articleRevisions"
		}),
		articleRevisions: r.many.articleRevisions(),
		articlesCreatedBy: r.many.articles({
			alias: "articles_createdBy_users_id"
		}),
		articlesUpdatedBy: r.many.articles({
			alias: "articles_updatedBy_users_id"
		}),
		sitesViaMedia: r.many.sites({
			from: r.users.id.through(r.media.createdBy),
			to: r.sites.id.through(r.media.siteId),
			alias: "users_id_sites_id_via_media"
		}),
		media: r.many.media(),
		sitesViaSiteMembers: r.many.sites({
			alias: "sites_id_users_id_via_siteMembers"
		}),
		siteMembers: r.many.siteMembers(),
	},
	articles: {
		users: r.many.users({
			alias: "users_id_articles_siteId_id_via_articleRevisions"
		}),
		articleRevisions: r.many.articleRevisions(),
		tags: r.many.tags({
			from: [r.articles.siteId.through(r.articleTags.siteId), r.articles.id.through(r.articleTags.articleId)],
			to: [r.tags.siteId.through(r.articleTags.siteId), r.tags.id.through(r.articleTags.tagId)]
		}),
		articleTags: r.many.articleTags(),
		userCreatedBy: r.one.users({
			from: r.articles.createdBy,
			to: r.users.id,
			alias: "articles_createdBy_users_id"
		}),
		site: r.one.sites({
			from: r.articles.siteId,
			to: r.sites.id
		}),
		userUpdatedBy: r.one.users({
			from: r.articles.updatedBy,
			to: r.users.id,
			alias: "articles_updatedBy_users_id"
		}),
		author: r.one.authors({
			from: [r.articles.siteId, r.articles.authorId],
			to: [r.authors.siteId, r.authors.id]
		}),
		category: r.one.categories({
			from: [r.articles.siteId, r.articles.categoryId],
			to: [r.categories.siteId, r.categories.id]
		}),
		media: r.one.media({
			from: [r.articles.siteId, r.articles.featuredMediaId],
			to: [r.media.siteId, r.media.id]
		}),
		menuItems: r.many.menuItems(),
	},
	articleRevisions: {
		user: r.one.users({
			from: r.articleRevisions.createdBy,
			to: r.users.id
		}),
		article: r.one.articles({
			from: [r.articleRevisions.siteId, r.articleRevisions.articleId],
			to: [r.articles.siteId, r.articles.id]
		}),
	},
	tags: {
		articles: r.many.articles(),
		articleTags: r.many.articleTags(),
		menuItems: r.many.menuItems(),
		site: r.one.sites({
			from: r.tags.siteId,
			to: r.sites.id
		}),
	},
	articleTags: {
		article: r.one.articles({
			from: [r.articleTags.siteId, r.articleTags.articleId],
			to: [r.articles.siteId, r.articles.id]
		}),
		tag: r.one.tags({
			from: [r.articleTags.siteId, r.articleTags.tagId],
			to: [r.tags.siteId, r.tags.id]
		}),
	},
	sites: {
		articles: r.many.articles(),
		authors: r.many.authors(),
		categories: r.many.categories(),
		usersViaMedia: r.many.users({
			alias: "users_id_sites_id_via_media"
		}),
		mediaSiteId: r.many.media({
			alias: "media_siteId_sites_id"
		}),
		menus: r.many.menus(),
		pages: r.many.pages(),
		redirects: r.many.redirects(),
		siteDomains: r.one.siteDomains(),
		usersViaSiteMembers: r.many.users({
			from: r.sites.id.through(r.siteMembers.siteId),
			to: r.users.id.through(r.siteMembers.userId),
			alias: "sites_id_users_id_via_siteMembers"
		}),
		siteMembers: r.many.siteMembers(),
		siteThemes: r.one.siteThemes(),
		mediaIdFaviconMediaId: r.one.media({
			from: [r.sites.id, r.sites.faviconMediaId],
			to: [r.media.siteId, r.media.id],
			alias: "sites_id_faviconMediaId_media_siteId_id"
		}),
		mediaIdLogoMediaId: r.one.media({
			from: [r.sites.id, r.sites.logoMediaId],
			to: [r.media.siteId, r.media.id],
			alias: "sites_id_logoMediaId_media_siteId_id"
		}),
		tags: r.many.tags(),
	},
	authors: {
		articles: r.many.articles(),
		site: r.one.sites({
			from: r.authors.siteId,
			to: r.sites.id
		}),
		media: r.one.media({
			from: [r.authors.siteId, r.authors.avatarMediaId],
			to: [r.media.siteId, r.media.id]
		}),
		siteMember: r.one.siteMembers({
			from: [r.authors.siteId, r.authors.userId],
			to: [r.siteMembers.siteId, r.siteMembers.userId]
		}),
	},
	categories: {
		articles: r.many.articles(),
		site: r.one.sites({
			from: r.categories.siteId,
			to: r.sites.id
		}),
		category: r.one.categories({
			from: [r.categories.siteId, r.categories.parentId],
			to: [r.categories.siteId, r.categories.id],
			alias: "categories_siteId_parentId_categories_siteId_id"
		}),
		categories: r.many.categories({
			alias: "categories_siteId_parentId_categories_siteId_id"
		}),
		menuItems: r.many.menuItems(),
	},
	media: {
		articles: r.many.articles(),
		authors: r.many.authors(),
		user: r.one.users({
			from: r.media.createdBy,
			to: r.users.id
		}),
		site: r.one.sites({
			from: r.media.siteId,
			to: r.sites.id,
			alias: "media_siteId_sites_id"
		}),
		sitesIdFaviconMediaId: r.many.sites({
			alias: "sites_id_faviconMediaId_media_siteId_id"
		}),
		sitesIdLogoMediaId: r.many.sites({
			alias: "sites_id_logoMediaId_media_siteId_id"
		}),
	},
	siteMembers: {
		authors: r.one.authors(),
		site: r.one.sites({
			from: r.siteMembers.siteId,
			to: r.sites.id
		}),
		user: r.one.users({
			from: r.siteMembers.userId,
			to: r.users.id
		}),
	},
	menuItems: {
		article: r.one.articles({
			from: [r.menuItems.siteId, r.menuItems.articleId],
			to: [r.articles.siteId, r.articles.id]
		}),
		category: r.one.categories({
			from: [r.menuItems.siteId, r.menuItems.categoryId],
			to: [r.categories.siteId, r.categories.id]
		}),
		menu: r.one.menus({
			from: [r.menuItems.siteId, r.menuItems.menuId],
			to: [r.menus.siteId, r.menus.id]
		}),
		page: r.one.pages({
			from: [r.menuItems.siteId, r.menuItems.pageId],
			to: [r.pages.siteId, r.pages.id]
		}),
		menuItem: r.one.menuItems({
			from: [r.menuItems.menuId, r.menuItems.parentId],
			to: [r.menuItems.menuId, r.menuItems.id],
			alias: "menuItems_menuId_parentId_menuItems_menuId_id"
		}),
		menuItems: r.many.menuItems({
			alias: "menuItems_menuId_parentId_menuItems_menuId_id"
		}),
		tag: r.one.tags({
			from: [r.menuItems.siteId, r.menuItems.tagId],
			to: [r.tags.siteId, r.tags.id]
		}),
	},
	menus: {
		menuItems: r.many.menuItems(),
		site: r.one.sites({
			from: r.menus.siteId,
			to: r.sites.id
		}),
	},
	pages: {
		menuItems: r.many.menuItems(),
		site: r.one.sites({
			from: r.pages.siteId,
			to: r.sites.id
		}),
	},
	redirects: {
		site: r.one.sites({
			from: r.redirects.siteId,
			to: r.sites.id
		}),
	},
	siteDomains: {
		site: r.one.sites({
			from: r.siteDomains.siteId,
			to: r.sites.id
		}),
	},
	siteThemes: {
		site: r.one.sites({
			from: r.siteThemes.siteId,
			to: r.sites.id
		}),
	},
}))