package com.nexustiers.client;

import java.util.List;

public record PlayerTierProfile(
        String ign,
        String username,
        String bestTier,
        List<TierResult> tiers
) {
    public record TierResult(
            String id,
            String playerUsername,
            String ign,
            String kit,
            String tier,
            String previousTier,
            String testerName,
            String createdAt,
            String discordMessage
    ) {}
}