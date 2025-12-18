/**
 * Referral System
 * 
 * A viral growth mechanism that rewards users for inviting others.
 * Implements a three-tier milestone system with progressive rewards.
 * 
 * Reward Structure:
 * - First referral: Both users get 3 days Pro trial + 50 credits
 * - 5 referrals: Referrer gets 7 days Pro + "Early Adopter" badge
 * - 10 referrals: Referrer gets 30 days Pro + "Ambassador" badge
 */

import { prisma } from '@/lib/prisma';

/**
 * Generate a unique referral code for a user.
 * Uses a combination of username prefix and random characters.
 */
export function generateReferralCode(userId: string, displayName?: string | null): string {
    const prefix = displayName
        ? displayName
            .slice(0, 4)
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '')
        : 'USER';
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${prefix}_${random}`;
}

/**
 * Ensure a user has a referral code, creating one if necessary.
 * Handles uniqueness conflicts by regenerating up to 5 times.
 */
export async function ensureReferralCode(userId: string): Promise<string> {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { referralCode: true, displayName: true },
    });

    if (user?.referralCode) {
        return user.referralCode;
    }

    // Generate new code with uniqueness check
    let code = generateReferralCode(userId, user?.displayName);
    let attempts = 0;

    while (attempts < 5) {
        const existing = await prisma.user.findUnique({
            where: { referralCode: code },
        });

        if (!existing) break;
        code = generateReferralCode(userId, user?.displayName);
        attempts++;
    }

    // Persist the code
    await prisma.user.update({
        where: { id: userId },
        data: { referralCode: code },
    });

    return code;
}

/**
 * Look up the referrer's user ID from a referral code.
 */
export async function getUserIdFromReferralCode(code: string): Promise<string | null> {
    const user = await prisma.user.findUnique({
        where: { referralCode: code },
        select: { id: true },
    });

    return user?.id || null;
}

/**
 * Track a new user signup via referral.
 * Creates a pending referral record that will be completed when
 * the referred user takes a qualifying action.
 */
export async function trackReferralSignup(
    referralCode: string,
    newUserId: string,
    referralUrl?: string
): Promise<boolean> {
    try {
        const referrerId = await getUserIdFromReferralCode(referralCode);
        if (!referrerId || referrerId === newUserId) {
            return false; // Self-referral not allowed
        }

        // Check for duplicate referral
        const existing = await prisma.referral.findFirst({
            where: {
                referredId: newUserId,
            },
        });

        if (existing) {
            return false; // Already referred
        }

        // Create pending referral record
        await prisma.referral.create({
            data: {
                code: referralCode,
                referrerId,
                referredId: newUserId,
                referralUrl,
                status: 'PENDING',
            },
        });

        return true;
    } catch (error) {
        console.error('[Referral] Error tracking signup:', error);
        return false;
    }
}

// Reward tier definitions
const REWARDS = {
    FIRST_REFERRAL: {
        referrer: { proTrialDays: 3, credits: 50 },
        referred: { proTrialDays: 3, credits: 50 },
    },
    MILESTONE_5: {
        referrer: { proTrialDays: 7, badges: ['early_adopter'] },
    },
    MILESTONE_10: {
        referrer: { proTrialDays: 30, badges: ['ambassador'] },
    },
};

/**
 * Complete a referral and distribute rewards to both parties.
 * Automatically checks for milestone achievements and grants bonus rewards.
 */
export async function completeReferral(referredUserId: string): Promise<void> {
    try {
        // Find pending referral
        const referral = await prisma.referral.findFirst({
            where: {
                referredId: referredUserId,
                status: 'PENDING',
            },
            include: {
                referrer: {
                    select: {
                        id: true,
                        rewards: true,
                    },
                },
            },
        });

        if (!referral) return;

        // Update status to completed
        await prisma.referral.update({
            where: { id: referral.id },
            data: {
                status: 'COMPLETED',
                completedAt: new Date(),
            },
        });

        // Grant rewards to referrer
        const rewards = REWARDS.FIRST_REFERRAL;
        await prisma.userRewards.upsert({
            where: { userId: referral.referrerId },
            create: {
                userId: referral.referrerId,
                proTrialDays: rewards.referrer.proTrialDays,
                credits: rewards.referrer.credits,
                totalReferrals: 1,
            },
            update: {
                proTrialDays: { increment: rewards.referrer.proTrialDays },
                credits: { increment: rewards.referrer.credits },
                totalReferrals: { increment: 1 },
            },
        });

        // Grant rewards to referred user
        await prisma.userRewards.upsert({
            where: { userId: referredUserId },
            create: {
                userId: referredUserId,
                proTrialDays: rewards.referred.proTrialDays,
                credits: rewards.referred.credits,
            },
            update: {
                proTrialDays: { increment: rewards.referred.proTrialDays },
                credits: { increment: rewards.referred.credits },
            },
        });

        // Mark as fully rewarded
        await prisma.referral.update({
            where: { id: referral.id },
            data: {
                status: 'REWARDED',
                rewardedAt: new Date(),
            },
        });

        // Check milestone achievements
        const totalReferrals = referral.referrer.rewards?.totalReferrals || 0;
        const newTotal = totalReferrals + 1;

        if (newTotal === 5) {
            await grantMilestoneReward(referral.referrerId, REWARDS.MILESTONE_5);
        }

        if (newTotal === 10) {
            await grantMilestoneReward(referral.referrerId, REWARDS.MILESTONE_10);
        }

        console.log(`[Referral] Completed: ${referral.id}`);
    } catch (error) {
        console.error('[Referral] Error completing referral:', error);
    }
}

/**
 * Grant milestone bonuses when users reach referral thresholds.
 */
async function grantMilestoneReward(
    userId: string,
    reward: { referrer: { proTrialDays: number; badges: string[] } }
) {
    const currentRewards = await prisma.userRewards.findUnique({
        where: { userId },
    });

    const existingBadges = JSON.parse((currentRewards?.badges as string) || '[]') as string[];
    const newBadges = [...existingBadges, ...reward.referrer.badges];

    await prisma.userRewards.update({
        where: { userId },
        data: {
            proTrialDays: { increment: reward.referrer.proTrialDays },
            badges: JSON.stringify(newBadges),
        },
    });
}

/**
 * Get comprehensive referral statistics for a user's profile.
 */
export async function getReferralStats(userId: string) {
    const [referrals, rewards] = await Promise.all([
        prisma.referral.findMany({
            where: { referrerId: userId },
            include: {
                referred: {
                    select: {
                        displayName: true,
                        imageUrl: true,
                        createdAt: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        }),
        prisma.userRewards.findUnique({
            where: { userId },
        }),
    ]);

    const pending = referrals.filter((r) => r.status === 'PENDING').length;
    const completed = referrals.filter(
        (r) => r.status === 'COMPLETED' || r.status === 'REWARDED'
    ).length;

    return {
        totalReferrals: completed,
        pendingReferrals: pending,
        rewards: rewards || {
            proTrialDays: 0,
            credits: 0,
            badges: [],
            totalReferrals: 0,
        },
        referrals,
    };
}
