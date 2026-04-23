import AdminInvitationSignUpPageClient from "@/components/admin/auth/AdminInvitationSignUpPageClient";

type SignUpSearchParams = Record<string, string | string[] | undefined>;

export default async function SignUpPage({
    searchParams,
}: {
    searchParams?: Promise<SignUpSearchParams> | SignUpSearchParams;
}) {
    const resolvedSearchParams = (await searchParams) ?? {};
    const ticketParam =
        resolvedSearchParams.__clerk_ticket ??
        resolvedSearchParams.__clerk_invitation_token;
    const ticket = Array.isArray(ticketParam)
        ? ticketParam[0] ?? null
        : ticketParam ?? null;

    return <AdminInvitationSignUpPageClient ticket={ticket} />;
}
