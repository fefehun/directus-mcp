import * as z from 'zod';
import { defineTool } from '../utils/define.js';
import { createCollection, deleteCollection } from '@directus/sdk';
import { fetchSchema } from '../utils/fetch-schema.js';
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
