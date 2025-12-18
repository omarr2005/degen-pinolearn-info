/**
 * Risk Radar Service
 * 
 * Token security analysis engine using GoPlus API.
 * Supports Ethereum and Solana token scanning.
 * 
 * Checks performed:
 * - Honeypot detection
 * - Developer holding analysis
 * - Liquidity lock status
 * - Contract verification
 * - Ownership analysis
 * - Mint/pause capabilities
 */

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

/**
 * Detect blockchain from address format.
 * - Ethereum: 0x prefix, 42 characters
 * - Solana: base58, 32-44 characters
 */
function detectChain(address: string): { chain: 'eth' | 'sol' | 'unknown'; chainId: string } {
    // Ethereum format
    if (address.startsWith('0x') && address.length === 42) {
        return { chain: 'eth', chainId: '1' };
    }

    // Solana format
    if (!address.startsWith('0x') && address.length >= 32 && address.length <= 44) {
        const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
        if (base58Regex.test(address)) {
            return { chain: 'sol', chainId: '900' };
        }
    }

    return { chain: 'unknown', chainId: '1' };
}

/**
 * Scan a token for security risks.
 * Uses GoPlus Security API (free tier).
 */
export async function scanToken(address: string): Promise<TokenScan> {
    const { chain, chainId } = detectChain(address);

    if (chain === 'unknown') {
        return createUnknownResult(address, 'Invalid address format. Use ETH (0x...) or Solana address.');
    }

    const cleanAddress = chain === 'eth' ? address.toLowerCase() : address;

    try {
        console.log(`[RiskRadar] Scanning ${chain.toUpperCase()} token:`, cleanAddress);

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

        if (honeypot) flags.push('[CRITICAL] HONEYPOT DETECTED');
        if (tokenData.is_proxy === '1') flags.push('[WARN] Proxy contract');
        if (tokenData.can_take_back_ownership === '1') flags.push('[WARN] Ownership can be reclaimed');
        if (tokenData.hidden_owner === '1') flags.push('[WARN] Hidden owner');
        if (tokenData.selfdestruct === '1') flags.push('[WARN] Can self-destruct');
        if (tokenData.external_call === '1') flags.push('[WARN] External calls');
        if (devHoldsPercent > 50) flags.push(`[HIGH] Dev holds ${devHoldsPercent.toFixed(1)}%`);
        else if (devHoldsPercent > 20) flags.push(`[MEDIUM] Dev holds ${devHoldsPercent.toFixed(1)}%`);
        if (!liquidityLocked) flags.push('[MEDIUM] Liquidity not locked');
        if (!contractVerified) flags.push('[MEDIUM] Contract not verified');
        if (tokenData.is_mintable === '1') flags.push('[WARN] Token is mintable');
        if (tokenData.transfer_pausable === '1') flags.push('[WARN] Transfers can be paused');
        if (tokenData.trading_cooldown === '1') flags.push('[WARN] Trading cooldown enabled');

        // Calculate risk score (0-100)
        let riskScore = 0;

        if (honeypot) riskScore += 100;
        if (devHoldsPercent > 50) riskScore += 40;
        else if (devHoldsPercent > 20) riskScore += 20;
        else if (devHoldsPercent > 10) riskScore += 10;
        if (!liquidityLocked) riskScore += 20;
        if (!contractVerified) riskScore += 15;
        if (tokenData.is_mintable === '1') riskScore += 10;
        if (tokenData.can_take_back_ownership === '1') riskScore += 15;
        if (tokenData.hidden_owner === '1') riskScore += 10;
        if (tokenData.selfdestruct === '1') riskScore += 25;

        riskScore = Math.min(100, riskScore);

        // Determine risk level
        let riskLevel: TokenScan['riskLevel'];
        let verdict: string;

        if (honeypot || riskScore >= 80) {
            riskLevel = 'CRITICAL';
            verdict = 'DO NOT BUY - Critical risks detected!';
        } else if (riskScore >= 50) {
            riskLevel = 'HIGH';
            verdict = 'HIGH RISK - Proceed with extreme caution';
        } else if (riskScore >= 25) {
            riskLevel = 'MEDIUM';
            verdict = 'MEDIUM RISK - Research more before buying';
        } else {
            riskLevel = 'LOW';
            verdict = 'LOW RISK - Looks relatively safe';
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

/**
 * Create a result for unknown/not-found tokens.
 */
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

/**
 * Format scan result for Telegram display.
 */
export function formatScanResult(scan: TokenScan): string {
    if (!scan.found) {
        return `
*RISK RADAR SCAN*

Token: \`${scan.address.slice(0, 10)}...${scan.address.slice(-6)}\`

Status: ${scan.verdict}

_Try a token on Ethereum mainnet or Solana_
`;
    }

    const riskIndicator = scan.riskLevel === 'CRITICAL' ? '[!!!]' :
        scan.riskLevel === 'HIGH' ? '[!!]' :
            scan.riskLevel === 'MEDIUM' ? '[!]' : '[OK]';

    const riskBar = getRiskBar(scan.riskScore);
    const tokenName = scan.name && scan.symbol ?
        `${scan.name} (${scan.symbol})` :
        `${scan.address.slice(0, 10)}...${scan.address.slice(-6)}`;

    return `
*RISK RADAR SCAN*

*Token:* ${tokenName}
\`${scan.address}\`

${riskIndicator} *Risk Level:* ${scan.riskLevel}
*Risk Score:* ${scan.riskScore}/100
\`[${riskBar}]\`

*Analysis:*

${scan.honeypot ? '[CRITICAL] HONEYPOT DETECTED!' : '[OK] Not a honeypot'}
${scan.devHoldsPercent > 20 ? '[HIGH]' : scan.devHoldsPercent > 10 ? '[MEDIUM]' : '[OK]'} Dev holds ${scan.devHoldsPercent.toFixed(1)}%
${scan.liquidityLocked ? '[OK] Liquidity locked' : '[MEDIUM] Liquidity NOT locked'}
${scan.contractVerified ? '[OK] Contract verified' : '[MEDIUM] Contract not verified'}

${scan.flags.length > 0 ? `*Flags:*\n${scan.flags.join('\n')}\n` : ''}

*Verdict:* ${scan.verdict}

_Always DYOR. This scan is not financial advice._
`;
}

/**
 * Generate visual risk bar.
 */
function getRiskBar(score: number): string {
    const filled = Math.round(score / 10);
    return '='.repeat(filled) + '-'.repeat(10 - filled);
}
