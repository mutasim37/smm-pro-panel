export type ChannelMember = { status: string; is_member?: boolean };

/** Check live on every interaction; inability to verify never grants access. */
export async function checkMembership(
  channel: string,
  userId: number,
  lookup: (channel: string, userId: number) => Promise<ChannelMember | null>,
): Promise<boolean> {
  if (!channel) return true;
  try {
    const member = await lookup(channel, userId);
    if (!member) return false;
    return ["creator", "administrator", "member"].includes(member.status)
      || (member.status === "restricted" && member.is_member === true);
  } catch {
    return false;
  }
}