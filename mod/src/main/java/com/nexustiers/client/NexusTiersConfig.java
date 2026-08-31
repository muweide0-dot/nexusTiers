package com.nexustiers.client;

public final class NexusTiersConfig {
    private NexusTiersConfig() {}

    /**
     * Point this at the published NexusTiers API before building the mod.
     * It must end with /api and must expose GET /players/{ign}/tiers.
     */
    public static final String API_BASE_URL = "http://localhost:5000/api";
    public static final String BADGE_ICON = "⚔";
}