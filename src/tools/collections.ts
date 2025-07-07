import * as z from 'zod';
import { defineTool } from '../utils/define.js';
import { createCollection, deleteCollection, readCollections, updateCollection } from '@directus/sdk';
import { fetchSchema } from '../utils/fetch-schema.js';
import { formatErrorResponse, formatSuccessResponse } from '../utils/response.js';
import type { Directus } from '../directus.js';
import type { Schema } from '../types/schema.js';

/**
 * Properly refreshes the schema cache by clearing old data and loading fresh schema
 */
async function refreshSchema(directus: Directus, schema: Schema): Promise<void> {
	// Clear all existing keys from the schema cache
	for (const key in schema) {
		delete schema[key];
	}
	
	// Fetch fresh schema and assign to the cache
	const updatedSchema = await fetchSchema(directus);
	Object.assign(schema, updatedSchema);
}

// Schema for collection meta configuration
const collectionMetaSchema = z.object({
	collection: z.string().optional(),
	icon: z.string().optional(),
	note: z.string().optional(),
	display_template: z.string().optional(),
	hidden: z.boolean().optional(),
	singleton: z.boolean().optional(),
	translations: z.record(z.string(), z.any()).optional(),
	archive_field: z.string().optional(),
	archive_app_filter: z.boolean().optional(),
	archive_value: z.string().optional(),
	unarchive_value: z.string().optional(),
	sort_field: z.string().optional(),
	accountability: z.enum(['all', 'activity']).optional(),
	color: z.string().optional(),
	item_duplication_fields: z.array(z.string()).optional(),
	sort: z.number().optional(),
	group: z.string().optional(),
	collapse: z.enum(['open', 'closed', 'locked']).optional(),
}).optional();

// Schema for collection field configuration  
const collectionFieldSchema = z.object({
	field: z.string(),
	type: z.string(),
	schema: z.object({
		name: z.string().optional(),
		table: z.string().optional(),
		data_type: z.string().optional(),
		default_value: z.any().optional(),
		max_length: z.number().optional(),
		is_nullable: z.boolean().optional(),
		is_primary_key: z.boolean().optional(),
		has_auto_increment: z.boolean().optional(),
		foreign_key_column: z.string().optional(),
		foreign_key_table: z.string().optional(),
		comment: z.string().optional(),
	}).optional(),
	meta: z.object({
		collection: z.string().optional(),
		field: z.string().optional(),
		hidden: z.boolean().optional(),
		interface: z.string().optional(),
		options: z.record(z.string(), z.any()).optional(),
		display: z.string().optional(),
		display_options: z.record(z.string(), z.any()).optional(),
		readonly: z.boolean().optional(),
		required: z.boolean().optional(),
		sort: z.number().optional(),
		special: z.array(z.string()).optional(),
		translations: z.record(z.string(), z.any()).optional(),
		width: z.enum(['half', 'half-left', 'half-right', 'full', 'fill']).optional(),
		group: z.string().optional(),
		note: z.string().optional(),
		conditions: z.array(z.record(z.string(), z.any())).optional(),
		validation: z.record(z.string(), z.any()).optional(),
		validation_message: z.string().optional(),
	}).optional(),
});

export const createCollectionTool = defineTool('create-collection', {
	description: 'Create a new collection in Directus with fields and metadata.',
	inputSchema: z.object({
		collection: z.string().describe('The name (ID) of the collection to create.'),
		meta: collectionMetaSchema.describe('Optional metadata configuration for the collection.'),
		schema: z.object({
			name: z.string().optional().describe('The database table name (usually same as collection).'),
			comment: z.string().optional().describe('Comment for the database table.'),
		}).optional().describe('Optional database schema configuration.'),
		fields: z.array(collectionFieldSchema).optional().describe('Optional array of fields to create with the collection.'),
	}),
	handler: async (directus, args, { schema }) => {
		try {
			// Prepare the collection data
			const collectionData: any = {
				collection: args.collection,
			};

			if (args.meta) {
				collectionData.meta = args.meta;
			}

			if (args.schema) {
				collectionData.schema = {
					name: args.schema.name || args.collection,
					comment: args.schema.comment,
				};
			} else {
				// Set empty schema object to create real collection with default fields
				collectionData.schema = {};
			}

			if (args.fields && args.fields.length > 0) {
				collectionData.fields = args.fields;
			}

			// Create the collection
			const result = await directus.request(createCollection(collectionData));

			// Refresh the schema cache after creating the collection
			await refreshSchema(directus, schema);

			return {
				content: [
					{
						type: 'text',
						text: `✅ Collection '${args.collection}' created successfully!\n\nResult: ${JSON.stringify(result, null, 2)}`,
					},
				],
			};
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 
				typeof error === 'object' ? JSON.stringify(error, null, 2) : String(error);
			return {
				content: [
					{
						type: 'text',
						text: `❌ Failed to create collection '${args.collection}': ${errorMessage}`,
					},
				],
			};
		}
	},
});

export const deleteCollectionTool = defineTool('delete-collection', {
	description: 'Delete a collection from Directus. WARNING: This will permanently delete the collection and all its data!',
	inputSchema: z.object({
		collection: z.string().describe('The name (ID) of the collection to delete.'),
		confirm: z.boolean().default(false).describe('Set to true to confirm deletion. This is a safety measure.'),
	}),
	handler: async (directus, args, { schema }) => {
		try {
			// Safety check
			if (!args.confirm) {
				return {
					content: [
						{
							type: 'text',
							text: `⚠️ Collection deletion requires confirmation. Please set 'confirm: true' to proceed with deleting collection '${args.collection}'. WARNING: This action cannot be undone!`,
						},
					],
				};
			}

			// Delete the collection
			await directus.request(deleteCollection(args.collection));

			// Refresh the schema cache after deleting the collection
			await refreshSchema(directus, schema);

			return {
				content: [
					{
						type: 'text',
						text: `✅ Collection '${args.collection}' deleted successfully!`,
					},
				],
			};
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 
				typeof error === 'object' ? JSON.stringify(error, null, 2) : String(error);
			return {
				content: [
					{
						type: 'text',
						text: `❌ Failed to delete collection '${args.collection}': ${errorMessage}`,
					},
				],
			};
		}
	},
});

export const createCollectionGroupTool = defineTool('create-collection-group', {
	description: 'Create a new collection group (folder) in Directus.',
	inputSchema: z.object({
		group: z.string().describe('The name (ID) of the group to create.'),
		meta: z.object({
			icon: z.string().optional().describe('Icon for the group.'),
			note: z.string().optional().describe('Note/description for the group.'),
			color: z.string().optional().describe('Color for the group.'),
			sort: z.number().optional().describe('Sort order for the group.'),
			hidden: z.boolean().optional().describe('Whether the group should be hidden.'),
		}).optional().describe('Optional metadata configuration for the group.'),
	}),
	handler: async (directus, args, { schema }) => {
		try {
			// Prepare the group collection data
			const groupData: any = {
				collection: args.group,
				meta: {
					group: null, // This makes it a parent group
					icon: args.meta?.icon || 'folder',
					note: args.meta?.note,
					color: args.meta?.color,
					sort: args.meta?.sort || 1,
					hidden: args.meta?.hidden || false,
				},
				schema: null, // Groups don't have a database table
			};

			// Create the group
			const result = await directus.request(createCollection(groupData));

			// Refresh the schema cache after creating the group
			await refreshSchema(directus, schema);

			return {
				content: [
					{
						type: 'text',
						text: `✅ Collection group '${args.group}' created successfully!\n\nResult: ${JSON.stringify(result, null, 2)}`,
					},
				],
			};
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 
				typeof error === 'object' ? JSON.stringify(error, null, 2) : String(error);
			return {
				content: [
					{
						type: 'text',
						text: `❌ Failed to create collection group '${args.group}': ${errorMessage}`,
					},
				],
			};
		}
	},
});

export const deleteCollectionGroupTool = defineTool('delete-collection-group', {
	description: 'Delete a collection group from Directus. Collections in the group will be moved to root level.',
	inputSchema: z.object({
		group: z.string().describe('The name (ID) of the group to delete.'),
		confirm: z.boolean().default(false).describe('Set to true to confirm deletion.'),
	}),
	handler: async (directus, args, { schema }) => {
		try {
			// Safety check
			if (!args.confirm) {
				return {
					content: [
						{
							type: 'text',
							text: `⚠️ Collection group deletion requires confirmation. Please set 'confirm: true' to proceed with deleting group '${args.group}'. WARNING: Collections in this group will be moved to root level!`,
						},
					],
				};
			}

			// First, move all collections from this group to root level
			try {
				const collections = await directus.request(readCollections());

				const collectionsInGroup = collections.filter((col: any) => col.meta?.group === args.group);
				
				for (const collection of collectionsInGroup) {
					await directus.request(updateCollection(collection.collection, {
						meta: {
							group: null,
						} as any,
					}));
				}
			} catch (error) {
				console.warn('Warning: Could not move collections from group to root level:', error);
			}

			// Delete the group
			await directus.request(deleteCollection(args.group));

			// Refresh the schema cache after deleting the group
			await refreshSchema(directus, schema);

			return {
				content: [
					{
						type: 'text',
						text: `✅ Collection group '${args.group}' deleted successfully! Collections have been moved to root level.`,
					},
				],
			};
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 
				typeof error === 'object' ? JSON.stringify(error, null, 2) : String(error);
			return {
				content: [
					{
						type: 'text',
						text: `❌ Failed to delete collection group '${args.group}': ${errorMessage}`,
					},
				],
			};
		}
	},
});

export const assignCollectionToGroupTool = defineTool('assign-collection-to-group', {
	description: 'Assign an existing collection to a group.',
	inputSchema: z.object({
		collection: z.string().describe('The name of the collection to assign.'),
		group: z.string().describe('The name of the group to assign to.'),
	}),
	handler: async (directus, args, { schema }) => {
		try {
			// Update the collection's group metadata
			await directus.request(updateCollection(args.collection, {
				meta: {
					group: args.group,
				} as any,
			}));

			// Refresh the schema cache after updating the collection
			await refreshSchema(directus, schema);

			return {
				content: [
					{
						type: 'text',
						text: `✅ Collection '${args.collection}' has been assigned to group '${args.group}' successfully!`,
					},
				],
			};
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 
				typeof error === 'object' ? JSON.stringify(error, null, 2) : String(error);
			return {
				content: [
					{
						type: 'text',
						text: `❌ Failed to assign collection '${args.collection}' to group '${args.group}': ${errorMessage}`,
					},
				],
			};
		}
	},
});

export const removeCollectionFromGroupTool = defineTool('remove-collection-from-group', {
	description: 'Remove a collection from its group (move to root level).',
	inputSchema: z.object({
		collection: z.string().describe('The name of the collection to remove from group.'),
	}),
	handler: async (directus, args, { schema }) => {
		try {
			// Update the collection's group metadata to null
			await directus.request(updateCollection(args.collection, {
				meta: {
					group: null,
				} as any,
			}));

			// Refresh the schema cache after updating the collection
			await refreshSchema(directus, schema);

			return {
				content: [
					{
						type: 'text',
						text: `✅ Collection '${args.collection}' has been removed from its group and moved to root level!`,
					},
				],
			};
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 
				typeof error === 'object' ? JSON.stringify(error, null, 2) : String(error);
			return {
				content: [
					{
						type: 'text',
						text: `❌ Failed to remove collection '${args.collection}' from group: ${errorMessage}`,
					},
				],
			};
		}
	},
});

export const listCollectionGroupsTool = defineTool('list-collection-groups', {
	description: 'List all collection groups and their assigned collections.',
	inputSchema: z.object({
		includeCollections: z.boolean().default(true).describe('Include collections assigned to each group.'),
	}),
	handler: async (directus, args) => {
		try {
			// Get all collections
			const collections = await directus.request(readCollections());

			// Separate groups and regular collections
			const groups: any[] = [];
			const regularCollections: any[] = [];

			(collections as any[]).forEach((col: any) => {
				if (col.meta?.group === null && !col.schema) {
					// This is a group (no schema and group is null)
					groups.push(col);
				} else {
					// This is a regular collection
					regularCollections.push(col);
				}
			});

			// Build the result
			let result = `📁 Collection Groups (${groups.length} found):\n\n`;

			if (groups.length === 0) {
				result += 'No collection groups found.\n';
			} else {
				groups.forEach((group) => {
					result += `🗂️  **${group.collection}**\n`;
					result += `   Icon: ${group.meta?.icon || 'folder'}\n`;
					if (group.meta?.note) {
						result += `   Note: ${group.meta.note}\n`;
					}
					if (group.meta?.color) {
						result += `   Color: ${group.meta.color}\n`;
					}

					if (args.includeCollections) {
						const collectionsInGroup = regularCollections.filter(col => col.meta?.group === group.collection);
						if (collectionsInGroup.length > 0) {
							result += `   Collections (${collectionsInGroup.length}):\n`;
							collectionsInGroup.forEach((col) => {
								result += `     - ${col.collection}\n`;
							});
						} else {
							result += '   Collections: None\n';
						}
					}
					result += '\n';
				});
			}

			// Add ungrouped collections
			const ungroupedCollections = regularCollections.filter(col => !col.meta?.group || col.meta.group === null);
			if (ungroupedCollections.length > 0) {
				result += `📋 Ungrouped Collections (${ungroupedCollections.length}):\n`;
				ungroupedCollections.forEach((col) => {
					result += `  - ${col.collection}\n`;
				});
			}

			return {
				content: [
					{
						type: 'text',
						text: result,
					},
				],
			};
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 
				typeof error === 'object' ? JSON.stringify(error, null, 2) : String(error);
			return {
				content: [
					{
						type: 'text',
						text: `❌ Failed to list collection groups: ${errorMessage}`,
					},
				],
			};
		}
	},
});

export const updateCollectionTool = defineTool('update-collection', {
	description: 'Update the metadata for an existing collection. Only the meta values of the collection object can be updated. Updating the collection name is not supported at this time.',
	inputSchema: z.object({
		collection: z.string().describe('Unique identifier of the collection.'),
		meta: z.record(z.string(), z.unknown()).describe('Metadata of the collection.'),
	}),
	handler: async (directus, input) => {
		try {
			const { collection, meta } = input;
			const result = await directus.request(updateCollection(collection, { meta }));
			return formatSuccessResponse(result);
		} catch (error) {
			return formatErrorResponse(error);
		}
	},
});
