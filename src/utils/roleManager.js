const { getRolesForLevel, getAllLevelRoles } = require('../database/db');

// Default level role thresholds and names the bot creates automatically
const DEFAULT_TEXT_ROLES = [
  { level: 5,  name: '📝 Newcomer'   },
  { level: 10, name: '💬 Chatter'    },
  { level: 20, name: '🗣️ Regular'   },
  { level: 35, name: '⭐ Veteran'    },
  { level: 50, name: '🔥 Elite'      },
  { level: 75, name: '💎 Legend'     },
];

const DEFAULT_VOICE_ROLES = [
  { level: 5,  name: '🎧 Listener'   },
  { level: 10, name: '🎙️ Talker'    },
  { level: 20, name: '📻 Regular'    },
  { level: 35, name: '🔊 Veteran'    },
  { level: 50, name: '🎵 Elite'      },
  { level: 75, name: '👑 Voice King' },
];

/**
 * Ensures the bot has created default level roles in the guild.
 * Called on /setup-roles or first level-up if no roles exist.
 * Returns array of created Role objects.
 */
async function createDefaultRoles(guild, type = 'text') {
  const { setLevelRole } = require('../database/db');
  const defaults = type === 'voice' ? DEFAULT_VOICE_ROLES : DEFAULT_TEXT_ROLES;
  const created = [];

  for (const def of defaults) {
    // Skip if a role is already configured at this level
    const existing = getAllLevelRoles(guild.id).find(r => r.level === def.level && r.type === type && r.role_id);
    if (existing) continue;

    try {
      const role = await guild.roles.create({
        name: def.name,
        reason: `Level bot: auto-created ${type} level ${def.level} role`,
        mentionable: false,
      });
      setLevelRole(guild.id, def.level, role.id, role.name, type);
      created.push({ level: def.level, role });
    } catch (err) {
      console.error(`[Roles] Failed to create role "${def.name}":`, err.message);
    }
  }

  return created;
}

/**
 * Assigns (and optionally removes lower) activity roles to a member after levelling up.
 * Handles both stack and non-stack mode.
 */
async function assignLevelRole(guild, member, level, type, stackRoles) {
  const earned = getRolesForLevel(guild.id, level, type, stackRoles);
  if (!earned.length) return null;

  const allRoles = getAllLevelRoles(guild.id).filter(r => r.type === type && r.role_id);
  const allRoleIds = allRoles.map(r => r.role_id);
  const keepIds   = earned.map(r => r.role_id).filter(Boolean);

  // Remove any level roles the member shouldn't have (handles non-stack mode)
  const toRemove = allRoleIds.filter(id => !keepIds.includes(id) && member.roles.cache.has(id));
  const toAdd    = keepIds.filter(id => !member.roles.cache.has(id));

  try {
    if (toRemove.length) await member.roles.remove(toRemove, `Level bot: ${type} level update`);
    if (toAdd.length)    await member.roles.add(toAdd,    `Level bot: reached ${type} level ${level}`);
  } catch (err) {
    console.error(`[Roles] Failed to update roles for ${member.user.tag}:`, err.message);
    return null;
  }

  // Return the highest newly-awarded role for announcement
  const highest = earned[0];
  return highest ? { level: highest.level, roleId: highest.role_id, roleName: highest.role_name } : null;
}

/**
 * Rebuilds roles for a member from scratch (used after /set-xp or /sync-roles)
 */
async function syncMemberRoles(guild, member, textLevel, voiceLevel, stackRoles) {
  await assignLevelRole(guild, member, textLevel,  'text',  stackRoles);
  await assignLevelRole(guild, member, voiceLevel, 'voice', stackRoles);
}

module.exports = {
  createDefaultRoles,
  assignLevelRole,
  syncMemberRoles,
  DEFAULT_TEXT_ROLES,
  DEFAULT_VOICE_ROLES,
};
