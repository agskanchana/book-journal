// Authentication service
class AuthService {
    constructor() {
        this.currentUser = null;
    }

    // Check if email is in allowed list
    isEmailAllowed(email) {
        if (!email) return false;
        const normalizedEmail = email.toLowerCase().trim();
        return window.BookJournalConfig.ALLOWED_EMAILS.some(allowedEmail =>
            allowedEmail.toLowerCase().trim() === normalizedEmail
        );
    }

    // Handle unauthorized user sign-in
    async signOutUnauthorized(email) {
        console.log('Unauthorized email attempted login:', email);

        try {
            await window.BookJournalConfig.supabase.auth.signOut();

            ons.notification.alert({
                message: `🚫 Access Denied\n\nSorry, ${email} is not authorized to access this Book Journal.\n\nThis is a private reading tracker limited to specific users only.`,
                title: 'Unauthorized Access',
                buttonLabel: 'OK'
            });

            window.uiService.showLoginPage();
        } catch (error) {
            console.error('Error signing out unauthorized user:', error);
        }
    }

    async createUserProfile(user) {
        try {
            const { error } = await window.BookJournalConfig.supabase
                .from('user_profiles')
                .upsert([{
                    id: user.id,
                    email: user.email,
                    full_name: user.user_metadata?.full_name ||
                              user.user_metadata?.name ||
                              user.email.split('@')[0],
                    avatar_url: user.user_metadata?.avatar_url ||
                               user.user_metadata?.picture || ''
                }], {
                    onConflict: 'id',
                    ignoreDuplicates: false
                });

            if (error) {
                console.error('Error creating/updating user profile:', error);
            }
        } catch (error) {
            console.error('Error with user profile:', error);
        }
    }

    updateUserInfo() {
        if (this.currentUser) {
            const userName = this.currentUser.user_metadata?.full_name || this.currentUser.email;
            const userAvatar = this.currentUser.user_metadata?.avatar_url || '';

            // Update toolbar user info
            const userNameEl = document.getElementById('userName');
            const userAvatarEl = document.getElementById('userAvatar');

            if (userNameEl) userNameEl.textContent = userName.split(' ')[0] || 'User';
            if (userAvatarEl) {
                userAvatarEl.src = userAvatar;
                userAvatarEl.style.display = userAvatar ? 'block' : 'none';
            }

            // Update profile modal
            const profileNameEl = document.getElementById('profileName');
            const profileEmailEl = document.getElementById('profileEmail');
            const profileAvatarEl = document.getElementById('profileAvatar');

            if (profileNameEl) profileNameEl.textContent = userName;
            if (profileEmailEl) profileEmailEl.textContent = this.currentUser.email;
            if (profileAvatarEl) {
                profileAvatarEl.src = userAvatar;
                profileAvatarEl.style.display = userAvatar ? 'block' : 'none';
            }
        }
    }
}

// Global functions for authentication
async function signInWithGoogle() {
    try {
        const loginButton = document.querySelector('.google-login-btn');
        if (loginButton) {
            loginButton.disabled = true;
            loginButton.innerHTML = '<ons-icon icon="fa-spinner" class="fa-spin" style="margin-right: 8px;"></ons-icon>Signing in...';
        }

        const { data, error } = await window.BookJournalConfig.supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: 'https://agskanchana.github.io/book-journal/'
            }
        });

        if (error) throw error;

    } catch (error) {
        console.error('Error signing in:', error);

        const loginButton = document.querySelector('.google-login-btn');
        if (loginButton) {
            loginButton.disabled = false;
            loginButton.innerHTML = '<ons-icon icon="fa-google" style="margin-right: 8px;"></ons-icon>Continue with Google';
        }

        ons.notification.alert({
            message: '❌ Error signing in with Google. Please try again.',
            title: 'Sign-in Error',
            buttonLabel: 'OK'
        });
    }
}

async function signOut() {
    try {
        const { error } = await window.BookJournalConfig.supabase.auth.signOut();
        if (error) throw error;
        hideUserMenu();
    } catch (error) {
        console.error('Error signing out:', error);
        alert('Error signing out. Please try again.');
    }
}

window.AuthService = AuthService;