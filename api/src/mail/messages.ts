import type { Mail } from './mailer';

const SIGN_OFF = '\n\nIf you did not ask for this, you can ignore this email.\n\n- Yu-Gi-Oh Progression Guide';

export function verificationEmail(to: string, duelistName: string, link: string): Mail {
    return {
        to,
        subject: 'Confirm your email for Yu-Gi-Oh Progression Guide',
        text: `Welcome, ${duelistName}!\n\nConfirm your email address to finish setting up your account:\n\n${link}\n\nThis link works once and expires in 24 hours.${SIGN_OFF}`,
    };
}

export function passwordResetEmail(to: string, duelistName: string, link: string): Mail {
    return {
        to,
        subject: 'Reset your Yu-Gi-Oh Progression Guide password',
        text: `Hi ${duelistName},\n\nChoose a new password here:\n\n${link}\n\nThis link works once and expires in 1 hour. Resetting signs you out everywhere.${SIGN_OFF}`,
    };
}
