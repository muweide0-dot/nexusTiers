package com.nexustiers.client;

import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.widget.ButtonWidget;
import net.minecraft.client.gui.widget.TextFieldWidget;
import net.minecraft.text.Text;

public final class NexusTiersLookupScreen extends Screen {
    private TextFieldWidget search;
    private PlayerTierProfile profile;
    private String status = "Enter a Minecraft IGN to load all kit tiers.";

    public NexusTiersLookupScreen() {
        super(Text.literal("NexusTiers player lookup"));
    }

    @Override
    protected void init() {
        int left = this.width / 2 - 140;
        search = new TextFieldWidget(this.textRenderer, left, 55, 280, 22, Text.literal("Minecraft IGN"));
        search.setPlaceholder(Text.literal("Minecraft IGN"));
        addDrawableChild(search);
        addDrawableChild(ButtonWidget.builder(Text.literal("Search"), button -> load())
                .dimensions(left, 83, 134, 22).build());
        addDrawableChild(ButtonWidget.builder(Text.literal("Close"), button -> close())
                .dimensions(left + 146, 83, 134, 22).build());
    }

    private void load() {
        String ign = search.getText().trim();
        if (ign.isEmpty()) {
            status = "Enter an IGN first.";
            return;
        }
        status = "Loading NexusTiers results...";
        NexusTiersClient.fetchProfile(ign, loaded -> {
            profile = loaded;
            status = "Results loaded.";
        });
    }

    @Override
    public void render(DrawContext context, int mouseX, int mouseY, float delta) {
        renderBackground(context, mouseX, mouseY, delta);
        int left = this.width / 2 - 160;
        context.drawCenteredTextWithShadow(textRenderer, title, this.width / 2, 22, 0xFFFFFFFF);
        context.drawTextWithShadow(textRenderer, Text.literal(status), left, 120, 0xFF9BA8C7);
        if (profile != null) {
            context.drawTextWithShadow(textRenderer,
                    Text.literal(profile.ign() + "  " + NexusTiersConfig.BADGE_ICON + " " + profile.bestTier()),
                    left, 145, 0xFF8CF0CE);
            int y = 170;
            for (PlayerTierProfile.TierResult tier : profile.tiers()) {
                context.drawTextWithShadow(textRenderer,
                        Text.literal(tier.kit().toUpperCase() + "  " + tier.tier() + "  •  Tester " + tier.testerName()),
                        left, y, 0xFFE5EAF6);
                y += 18;
            }
        }
        super.render(context, mouseX, mouseY, delta);
    }
}