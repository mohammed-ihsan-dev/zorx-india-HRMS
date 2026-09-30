import { Client } from '../models/Client.js';
import { ContentCalendarItem } from '../models/ContentCalendarItem.js';

/**
  Normalizes known PressD variations ("Press D", "Press.D", "PressD") to canonical "PressD".
  Also links unlinked ContentCalendarItem records to Client Master safely and idempotently.
 */
export async function migrateContentCalendarClients() {
  try {
    let canonicalPressD = await Client.findOne({ name: 'PressD' });

    // 1. Check for legacy variant Client records ("Press D", "Press.D") and merge them into "PressD"
    const pressDVariants = await Client.find({ name: { $in: ['Press D', 'Press.D'] } });
    if (pressDVariants.length > 0) {
      if (!canonicalPressD) {
        canonicalPressD = await Client.create({ name: 'PressD' });
      }

      for (const variantClient of pressDVariants) {
        // Re-link all ContentCalendarItem records pointing to this variant
        await ContentCalendarItem.updateMany(
          { $or: [{ clientId: variantClient._id }, { client: variantClient.name }] },
          { $set: { clientId: canonicalPressD._id, client: 'PressD' } }
        );
        // Remove the duplicate variant Client Master record
        await Client.findByIdAndDelete(variantClient._id);
      }
    }

    // 2. Normalize string 'client' values of "Press D" and "Press.D" to "PressD" across all items
    await ContentCalendarItem.updateMany(
      { client: { $in: ['Press D', 'Press.D'] } },
      { $set: { client: 'PressD' } }
    );

    // If PressD was mentioned but Client Master record doesn't exist yet, create it
    const hasPressDItems = await ContentCalendarItem.exists({ client: 'PressD' });
    if (hasPressDItems && !canonicalPressD) {
      canonicalPressD = await Client.create({ name: 'PressD' });
    }

    if (canonicalPressD) {
      await ContentCalendarItem.updateMany(
        { client: 'PressD', $or: [{ clientId: { $exists: false } }, { clientId: null }] },
        { $set: { clientId: canonicalPressD._id, client: 'PressD' } }
      );
    }

    // 3. Migrate any remaining items missing clientId
    const itemsWithoutClientId = await ContentCalendarItem.find({
      $or: [{ clientId: { $exists: false } }, { clientId: null }],
    });

    let count = 0;
    for (const item of itemsWithoutClientId) {
      let clientName = (item.client || '').trim();
      if (!clientName) {
        clientName = 'Unassigned Client';
      }

      // Exact case-insensitive match for existing Client Master record
      let clientRecord = await Client.findOne({
        name: new RegExp(`^${clientName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      });

      if (!clientRecord) {
        clientRecord = await Client.create({ name: clientName });
      }

      item.clientId = clientRecord._id;
      item.client = clientRecord.name;
      await item.save();
      count++;
    }

    return { migratedCount: count, message: 'Client Master normalization and linkage complete.' };
  } catch (err) {
    console.error('Error during Content Calendar client migration:', err);
    throw err;
  }
}
