// ═══════════════════════════════════════════════════════════════
// RISK RADAR SERVICE - Token security analysis via GoPlus API
// ═══════════════════════════════════════════════════════════════

export interface TokenScan {
    found: boolean;
    address: string;
    name?: string;
    symbol?: string;

    // Risk indicators
    honeypot: boolean;
    devHoldsPercent: number;
    liquidityLocked: boolean;
    contractVerified: boolean;

    // Risk assessment
    riskScore: number;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'UNKNOWN';
    verdict: string;

    // Additional flags
    flags: string[];
}

// GoPlus API response type
interface GoPlusResponse {
    result: {
        [address: string]: {
            token_name?: string;
            token_symbol?: string;
            is_honeypot?: string;
            creator_percent?: string;
            lp_holders?: Array<{ is_locked: number }>;
            is_open_source?: string;
            is_proxy?: string;
            can_take_back_ownership?: string;
            hidden_owner?: string;
            selfdestruct?: string;
            external_call?: string;
            is_mintable?: string;
            transfer_pausable?: string;
            trading_cooldown?: string;
        };
    };
}

// ═══════════════════════════════════════
// SCAN TOKEN
// ═══════════════════════════════════════

// Detect chain from address format
function detectChain(address: string): { chain: 'eth' | 'sol' | 'unknown'; chainId: string } {
    // Ethereum: 0x prefix, 42 chars
    if (address.startsWith('0x') && address.length === 42) {
        return { chain: 'eth', chainId: '1' };
    }
    // Solana: base58, typically 32-44 chars, no 0x prefix
    if (!address.startsWith('0x') && address.length >= 32 && address.length <= 44) {
        // Check if it's valid base58 (alphanumeric, no 0, O, I, l)
        const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
        if (base58Regex.test(address)) {
            return { chain: 'sol', chainId: '900' }; // GoPlus Solana chain ID
        }
    }
    return { chain: 'unknown', chainId: '1' };
}

export async function scanToken(address: string): Promise<TokenScan> {
    const { chain, chainId } = detectChain(address);

    // Validate address format
    if (chain === 'unknown') {
        return createUnknownResult(address, 'Invalid address format. Use ETH (0x...) or Solana address.');
    }

    const cleanAddress = chain === 'eth' ? address.toLowerCase() : address;

    try {
        console.log(`[RiskRadar] Scanning ${chain.toUpperCase()} token:`, cleanAddress);

        // GoPlus Security API - FREE! Supports Ethereum (1) and Solana (900)
        const url = `https://api.gopluslabs.io/api/v1/token_security/${chainId}?contract_addresses=${cleanAddress}`;

        const response = await fetch(url);
        const data = await response.json() as GoPlusResponse;

        // Check if token was found
        const tokenData = data.result?.[cleanAddress];

        if (!tokenData) {
            console.log(`[RiskRadar] Token not found on ${chain === 'eth' ? 'Ethereum' : 'Solana'}`);
            return createUnknownResult(cleanAddress, `Token not found on ${chain === 'eth' ? 'Ethereum mainnet' : 'Solana'}`);
        }

        // Parse security data
        const honeypot = tokenData.is_honeypot === '1';
        const devHoldsPercent = parseFloat(tokenData.creator_percent || '0') * 100;
        const liquidityLocked = tokenData.lp_holders?.[0]?.is_locked === 1;
        const contractVerified = tokenData.is_open_source === '1';

        // Collect risk flags
        const flags: string[] = [];

        if (honeypot) flags.push('🚨 HONEYPOT DETECTED');
        if (tokenData.is_proxy === '1') flags.push('⚠️ Proxy contract');
        if (tokenData.can_take_back_ownership === '1') flags.push('⚠️ Ownership can be reclaimed');
        if (tokenData.hidden_owner === '1') flags.push('⚠️ Hidden owner');
        if (tokenData.selfdestruct === '1') flags.push('⚠️ Can self-destruct');
        if (tokenData.external_call === '1') flags.push('⚠️ External calls');
        if (devHoldsPercent > 50) flags.push(`🔴 Dev holds ${devHoldsPercent.toFixed(1)}%`);
        else if (devHoldsPercent > 20) flags.push(`🟡 Dev holds ${devHoldsPercent.toFixed(1)}%`);
        if (!liquidityLocked) flags.push('🟡 Liquidity not locked');
        if (!contractVerified) flags.push('🟡 Contract not verified');
        if (tokenData.is_mintable === '1') flags.push('⚠️ Token is mintable');
        if (tokenData.transfer_pausable === '1') flags.push('⚠️ Transfers can be paused');
        if (tokenData.trading_cooldown === '1') flags.push('⚠️ Trading cooldown enabled');

        // Calculate risk score (0-100)
        let riskScore = 0;

        if (honeypot) riskScore += 100;  // Instant max risk
        if (devHoldsPercent > 50) riskScore += 40;
        else if (devHoldsPercent > 20) riskScore += 20;
        else if (devHoldsPercent > 10) riskScore += 10;
        if (!liquidityLocked) riskScore += 20;
        if (!contractVerified) riskScore += 15;
        if (tokenData.is_mintable === '1') riskScore += 10;
        if (tokenData.can_take_back_ownership === '1') riskScore += 15;
        if (tokenData.hidden_owner === '1') riskScore += 10;
        if (tokenData.selfdestruct === '1') riskScore += 25;

        // Cap at 100
        riskScore = Math.min(100, riskScore);

        // Determine risk level
        let riskLevel: TokenScan['riskLevel'];
        let verdict: string;

        if (honeypot || riskScore >= 80) {
            riskLevel = 'CRITICAL';
            verdict = '🚫 DO NOT BUY - Critical risks detected!';
        } else if (riskScore >= 50) {
            riskLevel = 'HIGH';
            verdict = '⚠️ HIGH RISK - Proceed with extreme caution';
        } else if (riskScore >= 25) {
            riskLevel = 'MEDIUM';
            verdict = '🟡 MEDIUM RISK - Research more before buying';
        } else {
            riskLevel = 'LOW';
            verdict = '🟢 LOW RISK - Looks relatively safe';
        }

        console.log(`[RiskRadar] Scan complete: ${riskLevel} (score: ${riskScore})`);

        return {
            found: true,
            address: cleanAddress,
            name: tokenData.token_name || undefined,
            symbol: tokenData.token_symbol || undefined,
            honeypot,
            devHoldsPercent,
            liquidityLocked,
            contractVerified,
            riskScore,
            riskLevel,
            verdict,
            flags
        };

    } catch (error) {
        console.error('[RiskRadar] Scan error:', error);
        return createUnknownResult(cleanAddress, 'Error scanning token. Try again.');
    }
}

// ═══════════════════════════════════════
// HELPER
// ═══════════════════════════════════════

function createUnknownResult(address: string, verdict: string): TokenScan {
    return {
        found: false,
        address,
        honeypot: false,
        devHoldsPercent: 0,
        liquidityLocked: false,
        contractVerified: false,
        riskScore: 50,
        riskLevel: 'UNKNOWN',
        verdict,
        flags: []
    };
}

// ═══════════════════════════════════════
// FORMAT SCAN RESULT
// ═══════════════════════════════════════

export function formatScanResult(scan: TokenScan): string {
    if (!scan.found) {
        return `
📡 *RISK RADAR SCAN*

━━━━━━━━━━━━━━━━━━━━━

📍 *Token:* \`${scan.address.slice(0, 10)}...${scan.address.slice(-6)}\`

❓ *Status:* ${scan.verdict}

━━━━━━━━━━━━━━━━━━━━━

_Try a token on Ethereum mainnet_
`;
    }

    const riskEmoji = scan.riskLevel === 'CRITICAL' ? '🔴' :
        scan.riskLevel === 'HIGH' ? '🔴' :
            scan.riskLevel === 'MEDIUM' ? '🟡' : '🟢';

    const riskBar = getRiskBar(scan.riskScore);
    const tokenName = scan.name && scan.symbol ?
        `${scan.name} (${scan.symbol})` :
        `${scan.address.slice(0, 10)}...${scan.address.slice(-6)}`;

    return `
📡 *RISK RADAR SCAN*

━━━━━━━━━━━━━━━━━━━━━

📍 *Token:* ${tokenName}
📋 \`${scan.address}\`

${riskEmoji} *Risk Level:* ${scan.riskLevel}
📊 *Risk Score:* ${scan.riskScore}/100
\`[${riskBar}]\`

━━━━━━━━━━━━━━━━━━━━━

📋 *Analysis:*

${scan.honeypot ? '🔴 HONEYPOT DETECTED!' : '🟢 Not a honeypot'}
${scan.devHoldsPercent > 20 ? '🔴' : scan.devHoldsPercent > 10 ? '🟡' : '🟢'} Dev holds ${scan.devHoldsPercent.toFixed(1)}%
${scan.liquidityLocked ? '🟢 Liquidity locked' : '🟡 Liquidity NOT locked'}
${scan.contractVerified ? '🟢 Contract verified' : '🟡 Contract not verified'}

${scan.flags.length > 0 ? `*Flags:*\n${scan.flags.join('\n')}\n` : ''}
━━━━━━━━━━━━━━━━━━━━━

⚡ *Verdict:* ${scan.verdict}

_Always DYOR. This scan is not financial advice._
`;
}

function getRiskBar(score: number): string {
    const filled = Math.round(score / 10);
    return '█'.repeat(filled) + '░'.repeat(10 - filled);
}
