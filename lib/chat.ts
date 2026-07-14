// Shared chat helpers used by team-join and invitation-accept flows.

// Ensure the new member is in the team channel and has a direct thread with the owner.
export async function linkNewMember(sql: any, teamId: number, ownerId: number, userId: number) {
  const [teamConv] = await sql`SELECT id FROM conversations WHERE team_id = ${teamId} AND type = 'team' LIMIT 1`;
  let teamConvId = teamConv?.id;
  if (!teamConvId) {
    const [created] = await sql`INSERT INTO conversations (team_id, type, name) VALUES (${teamId}, 'team', 'Týmový chat') RETURNING id`;
    teamConvId = created.id;
  }
  const members = await sql`SELECT id FROM users WHERE team_id = ${teamId}`;
  for (const m of members) {
    const exists = await sql`SELECT id FROM conversation_members WHERE conversation_id = ${teamConvId} AND user_id = ${m.id}`;
    if (exists.length === 0) {
      await sql`INSERT INTO conversation_members (conversation_id, user_id) VALUES (${teamConvId}, ${m.id})`;
    }
  }
  if (userId !== ownerId) {
    const [direct] = await sql`INSERT INTO conversations (team_id, type) VALUES (${teamId}, 'direct') RETURNING id`;
    await sql`INSERT INTO conversation_members (conversation_id, user_id) VALUES (${direct.id}, ${ownerId})`;
    await sql`INSERT INTO conversation_members (conversation_id, user_id) VALUES (${direct.id}, ${userId})`;
  }
}
