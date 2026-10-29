package xyz.kingar1000.ar;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keymapping.v1.KeyMappingHelper;
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElementRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.hud.VanillaHudElements;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.KeyMapping;
import com.mojang.blaze3d.platform.InputConstants;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.resources.Identifier;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import java.nio.file.*;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

public final class ArClient implements ClientModInitializer {
    public static final Logger LOG=LoggerFactory.getLogger("AR Client");
    public static final Gson GSON=new GsonBuilder().setPrettyPrinting().create();
    public static final Path CONFIG=FabricLoader.getInstance().getConfigDir().resolve("ar-client.json");
    public static Layout layout=new Layout();
    public static KeyMapping zoom,sprint,sneak,editor;
    public static boolean sprintEnabled,sneakEnabled;
    private static boolean chatConfigured;
    public static final int LEFT_BUTTON=1, RIGHT_BUTTON=3;
    public static final ArrayDeque<Long> leftClicks=new ArrayDeque<>(),rightClicks=new ArrayDeque<>();
    public static class Widget {
        public String id="FPS",color="#ffffff"; public double x=.03,y=.05,scale=1,opacity=.85; public boolean enabled=true;
        public Widget(){} public Widget(String id,double y){this.id=id;this.y=y;}
    }
    public static class Layout {
        public List<Widget> widgets=new ArrayList<>(); public boolean toggleSprint=false;
        public boolean customCrosshair=false,hideScoreboard=false; public int crosshairSize=4,crosshairGap=2; public String crosshairColor="#ffffff"; public double chatOpacity=1;
        public Layout(){String[] names={"FPS","CPS","Keystrokes","Coordinates","Ping","Armor","Potions","Clock"};for(int i=0;i<names.length;i++)widgets.add(new Widget(names[i],.05+i*.09));}
    }
    @Override public void onInitializeClient(){
        try {if(Files.exists(CONFIG)){Layout loaded=GSON.fromJson(Files.readString(CONFIG),Layout.class);if(loaded!=null&&loaded.widgets!=null)layout=loaded;}}catch(Exception e){LOG.warn("Could not read AR HUD layout; using defaults",e);}
        sanitize();sprintEnabled=layout.toggleSprint;

        KeyMapping.Category category=KeyMapping.Category.register(Identifier.fromNamespaceAndPath("ar_client","controls"));
        zoom=KeyMappingHelper.registerKeyMapping(new KeyMapping("key.ar_client.zoom",InputConstants.Type.KEYBOARD,InputConstants.KEY_C,category));
        sprint=KeyMappingHelper.registerKeyMapping(new KeyMapping("key.ar_client.sprint",InputConstants.Type.KEYBOARD,InputConstants.KEY_R,category));
        sneak=KeyMappingHelper.registerKeyMapping(new KeyMapping("key.ar_client.sneak",InputConstants.Type.KEYBOARD,InputConstants.KEY_V,category));
        editor=KeyMappingHelper.registerKeyMapping(new KeyMapping("key.ar_client.editor",InputConstants.Type.KEYBOARD,InputConstants.KEY_RSHIFT,category));
        ClientTickEvents.END_CLIENT_TICK.register(client->{
            if(!chatConfigured && client.options != null){client.options.chatOpacity().set(clamp(layout.chatOpacity,0,1));chatConfigured=true;}
            while(sprint.consumeClick())sprintEnabled=!sprintEnabled;
            while(sneak.consumeClick()){sneakEnabled=!sneakEnabled;client.options.keyShift.setDown(sneakEnabled);}
            while(editor.consumeClick())client.gui.setScreen(new HudEditor());
            if(client.player!=null&&client.gui.screen()==null){if(sprintEnabled&&client.options.keyUp.isDown()&&!client.player.isShiftKeyDown())client.player.setSprinting(true);if(sneakEnabled)client.options.keyShift.setDown(true);}
            if(client.player==null&&sneakEnabled){sneakEnabled=false;client.options.keyShift.setDown(false);}
        });
        HudElementRegistry.replaceElement(VanillaHudElements.CROSSHAIR, original -> (context, tick) -> {
            if (!layout.customCrosshair) { original.extractRenderState(context, tick); return; }
            Minecraft client = Minecraft.getInstance();
            if (client.player == null || !client.options.getCameraType().isFirstPerson()) return;
            int x=context.guiWidth()/2,y=context.guiHeight()/2;
            int size=(int)clamp(layout.crosshairSize,2,16),gap=(int)clamp(layout.crosshairGap,0,10);
            int color=0xffffffff;
            try { color=0xff000000|Integer.parseInt(layout.crosshairColor.substring(1),16); } catch(Exception ignored) {}
            context.fill(x-gap-size,y,x-gap,y+1,color);context.fill(x+gap+1,y,x+gap+size+1,y+1,color);
            context.fill(x,y-gap-size,x+1,y-gap,color);context.fill(x,y+gap+1,x+1,y+gap+size+1,color);
        });
        HudElementRegistry.replaceElement(VanillaHudElements.SCOREBOARD, original -> (context, tick) -> {
            if (!layout.hideScoreboard) original.extractRenderState(context, tick);
        });
        HudElementRegistry.attachElementBefore(VanillaHudElements.CHAT,Identifier.fromNamespaceAndPath("ar_client","hud"),(context,tick)->render(context,false));
    }
    public static void sanitize(){layout.widgets.removeIf(Objects::isNull);for(Widget w:layout.widgets){w.x=clamp(w.x,0,.95);w.y=clamp(w.y,0,.95);w.scale=clamp(w.scale,.5,3);w.opacity=clamp(w.opacity,.2,1);if(w.id==null)w.id="FPS";if(w.color==null||!w.color.matches("#[0-9a-fA-F]{6}"))w.color="#ffffff";}}
    public static double clamp(double v,double min,double max){return Double.isFinite(v)?Math.max(min,Math.min(max,v)):min;}
    public static void save(){sanitize();try{Files.createDirectories(CONFIG.getParent());Path tmp=CONFIG.resolveSibling("ar-client.json.tmp");Files.writeString(tmp,GSON.toJson(layout));Files.move(tmp,CONFIG,StandardCopyOption.REPLACE_EXISTING);}catch(Exception e){LOG.error("Could not save AR HUD layout",e);}}
    public static void click(int button){if(Minecraft.getInstance().gui.screen()!=null)return;if(button==LEFT_BUTTON){leftClicks.addLast(System.nanoTime());cps(leftClicks);}if(button==RIGHT_BUTTON){rightClicks.addLast(System.nanoTime());cps(rightClicks);}}
    private static int cps(ArrayDeque<Long> clicks){long cutoff=System.nanoTime()-1_000_000_000L;while(!clicks.isEmpty()&&clicks.peekFirst()<cutoff)clicks.removeFirst();return clicks.size();}
    public static String text(Widget w){Minecraft c=Minecraft.getInstance();if(c.player==null)return w.id;return switch(w.id){
        case "FPS"->c.getFps()+" FPS";
        case "CPS"->cps(leftClicks)+" / "+cps(rightClicks)+" CPS";
        case "Coordinates"->String.format(Locale.ROOT,"XYZ %.0f / %.0f / %.0f",c.player.getX(),c.player.getY(),c.player.getZ());
        case "Keystrokes"->(c.options.keyUp.isDown()?"[W]":" W ")+" "+(c.options.keyLeft.isDown()?"[A]":" A ")+" "+(c.options.keyDown.isDown()?"[S]":" S ")+" "+(c.options.keyRight.isDown()?"[D]":" D ")+(sprintEnabled?"  Sprint":"");
        case "Ping"->{var entry=c.getConnection()==null?null:c.getConnection().getPlayerInfo(c.player.getUUID());yield entry==null?"Ping —":entry.getLatency()+" ms";}
        case "Armor"->{StringJoiner armor=new StringJoiner(" | ");for(EquipmentSlot slot:List.of(EquipmentSlot.HEAD,EquipmentSlot.CHEST,EquipmentSlot.LEGS,EquipmentSlot.FEET)){var item=c.player.getItemBySlot(slot);if(!item.isEmpty())armor.add(item.getHoverName().getString()+" "+(item.getMaxDamage()-item.getDamageValue()));}yield armor.length()==0?"No armor":armor.toString();}
        case "Potions"->{StringJoiner effects=new StringJoiner(" | ");for(var effect:c.player.getActiveEffects())effects.add(effect.getEffect().value().getDisplayName().getString()+" "+(effect.getAmplifier()+1)+" · "+effect.getDuration()/20+"s");yield effects.length()==0?"No effects":effects.toString();}
        case "Clock"->LocalTime.now().format(DateTimeFormatter.ofPattern("HH:mm"));
        default->w.id;
    };}
    public static void render(GuiGraphicsExtractor ctx,boolean editing){Minecraft c=Minecraft.getInstance();if(!editing&&(c.player==null||c.gui.hud.isHidden()||c.gui.screen() instanceof HudEditor))return;for(Widget w:layout.widgets){if(!w.enabled)continue;String label=text(w);int x=(int)(w.x*ctx.guiWidth()),y=(int)(w.y*ctx.guiHeight());int rgb;try{rgb=Integer.parseInt(w.color.substring(1),16);}catch(Exception e){rgb=0xffffff;}int alpha=(int)(w.opacity*255);var matrices=ctx.pose();matrices.pushMatrix();matrices.translate(x,y);matrices.scale((float)w.scale,(float)w.scale);ctx.fill(-4,-3,c.font.width(label)+4,12,((int)(w.opacity*150)<<24)|0x151515);ctx.text(c.font,label,0,0,(alpha<<24)|rgb);matrices.popMatrix();}}
}
