-- Grant execute permission on get_project_members RPC to authenticated users.
-- Without this, Supabase returns 400 Bad Request when authenticated users call the RPC.

GRANT EXECUTE ON FUNCTION get_project_members(uuid) TO authenticated;

-- Also grant execute on other chat RPCs that may be missing grants
GRANT EXECUTE ON FUNCTION provision_general_channel(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION create_project_chat_group(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_unread_counts() TO authenticated;
