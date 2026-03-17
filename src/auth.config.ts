import Google from 'next-auth/providers/google';
import GitHub from 'next-auth/providers/github';
import Azure from 'next-auth/providers/azure-ad';
import Apple from 'next-auth/providers/apple';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import sql from '@/database/pgsql';

type NextAuthConfig = any;

const providers: any[] = [];

if (process.env.GOOGLE_ID && process.env.GOOGLE_SECRET) {
  providers.push(
    Google({
      clientId: process.env.GOOGLE_ID,
      clientSecret: process.env.GOOGLE_SECRET,
      // Security: disabled email account linking - requires email verification
    })
  );
}

if (process.env.GITHUB_ID && process.env.GITHUB_SECRET) {
  providers.push(
    GitHub({
      clientId: process.env.GITHUB_ID,
      clientSecret: process.env.GITHUB_SECRET,
      // Security: disabled email account linking - requires email verification
    })
  );
}

if (process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET && process.env.AZURE_TENANT_ID) {
  providers.push(
    Azure({
      clientId: process.env.AZURE_CLIENT_ID,
      clientSecret: process.env.AZURE_CLIENT_SECRET,
      tenantId: process.env.AZURE_TENANT_ID,
      // Security: disabled email account linking - requires email verification
    })
  );
}

if (process.env.APPLE_ID && process.env.APPLE_SECRET) {
  providers.push(
    Apple({
      clientId: process.env.APPLE_ID,
      clientSecret: process.env.APPLE_SECRET,
      // Security: disabled email account linking - requires email verification
    })
  );
}

// Only add credentials provider if we need it (optional for OAuth-only setup)
if (process.env.ENABLE_CREDENTIALS_AUTH !== 'false') {
  try {
    providers.push(
      Credentials({
        id: 'credentials',
        name: 'Credentials',
        credentials: {
          email: { label: 'Email', type: 'text' },
          password: { label: 'Password', type: 'password' },
        },
        async authorize(credentials) {
          if (!credentials?.email || !credentials?.password) {
            console.error('Missing email or password');
            return null;
          }

          try {
            const dbConnection = sql as any;
            const users = await dbConnection`
              SELECT user_id, email, hashed_password FROM app.login WHERE email = ${credentials.email}
            `;

            if (!users || !Array.isArray(users) || users.length === 0) {
              console.error('User not found');
              return null;
            }

            const user = users[0] as any;
            const isPasswordValid = await bcrypt.compare(
              credentials.password,
              user.hashed_password
            );

            if (!isPasswordValid) {
              console.error('Invalid password');
              return null;
            }

            return {
              id: user.user_id,
              email: user.email,
            };
          } catch (error: any) {
            console.error('Auth error:', error);
            return null;
          }
        },
      })
    );
  } catch (error) {
    console.warn('Failed to initialize Credentials provider:', error);
  }
}

export const authConfig: NextAuthConfig = {
  providers,
  pages: {
    signIn: '/login',
    error: '/auth/error',
  },
  callbacks: {
    async signIn({ user, account }: any) {
      if (account?.provider !== 'credentials') {
        return true;
      }
      return true;
    },
    async session({ session, user }: any) {
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
  events: {
    async signIn({ user, account }: any) {
      console.log(`User ${user.email} signed in via ${account?.provider}`);
    },
  },
};
