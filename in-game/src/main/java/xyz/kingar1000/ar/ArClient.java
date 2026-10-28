package xyz.kingar1000.ar;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElementRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.hud.VanillaHudElements;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.option.KeyBinding;
import net.minecraft.client.util.InputUtil;
import net.minecraft.entity.EquipmentSlot;
import net.minecraft.util.Identifier;
import org.lwjgl.glfw.GLFW;
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
    public static KeyBinding zoom,sprint,sneak,editor;
    public static boolean sprintEnabled,sneakEnabled;
    public static final ArrayDeque<Long> leftClicks=new ArrayDeque<>(),rightClicks=new ArrayDeque<>();
    public static class Widget {
        public String id="FPS",color="#ffffff"; public double x=.03,y=.05,scale=1,opacity=.85; public boolean enabled=true;
        public Widget(){} public Widget(String id,double y){this.id=id;this.y=y;}
    }
    public static class Layout {
        public List<Widget> widgets=new ArrayList<>(); public boolean toggleSprint=false; public String zoomKey="C";
        public boolean customCrosshair=false,hideScoreboard=false; public int crosshairSize=4,crosshairGap=2; public String crosshairColor="#ffffff"; public double chatOpacity=1;
        public Layout(){String[] names={"FPS","CPS","Keystrokes","Coordinates","Ping","Armor","Potions","Clock"};for(int i=0;i<names.length;i++)widgets.add(new Widget(names[i],.05+i*.09));}
    }
    @Override public void onInitializeClient(){
        try {if(Files.exists(CONFIG)){Layout loaded=GSON.fromJson(Files.readString(CONFIG),Layout.class);if(loaded!=null&&loaded.widgets!=null)layout=loaded;}}catch(Exception e){LOG.warn("Could not read AR HUD layout; using defaults",e);}
        sanitize();sprintEnabled=layout.toggleSprint;
        MinecraftClient.getInstance().options.getChatOpacity().setValue(clamp(layout.chatOpacity,0,1));
        KeyBinding.Category category=KeyBinding.Category.create(Identifier.of("ar_client","controls"));
        zoom=KeyBindingHelper.registerKeyBinding(new KeyBinding("key.ar_client.zoom",InputUtil.Type.KEYSYM,GLFW.GLFW_KEY_C,category));
        sprint=KeyBindingHelper.registerKeyBinding(new KeyBinding("key.ar_client.sprint",InputUtil.Type.KEYSYM,GLFW.GLFW_KEY_R,category));
        sneak=KeyBindingHelper.registerKeyBinding(new KeyBinding("key.ar_client.sneak",InputUtil.Type.KEYSYM,GLFW.GLFW_KEY_V,category));
        editor=KeyBindingHelper.registerKeyBinding(new KeyBinding("key.ar_client.editor",InputUtil.Type.KEYSYM,GLFW.GLFW_KEY_RIGHT_SHIFT,category));
        ClientTickEvents.END_CLIENT_TICK.register(client->{
            while(sprint.wasPressed())sprintEnabled=!sprintEnabled;
            while(sneak.wasPressed()){sneakEnabled=!sneakEnabled;client.options.sneakKey.setPressed(sneakEnabled);}
            while(editor.wasPressed())client.setScreen(new HudEditor());
            if(client.player!=null&&client.currentScreen==null){if(sprintEnabled&&client.options.forwardKey.isPressed()&&!client.player.isSneaking())client.player.setSprinting(true);if(sneakEnabled)client.options.sneakKey.setPressed(true);}
            if(client.player==null&&sneakEnabled){sneakEnabled=false;client.options.sneakKey.setPressed(false);}
        });
        HudElementRegistry.attachElementBefore(VanillaHudElements.CHAT,Identifier.of("ar_client","hud"),(context,tick)->render(context,false));
    }
    public static void sanitize(){layout.widgets.removeIf(Objects::isNull);for(Widget w:layout.widgets){w.x=clamp(w.x,0,.95);w.y=clamp(w.y,0,.95);w.scale=clamp(w.scale,.5,3);w.opacity=clamp(w.opacity,.2,1);if(w.id==null)w.id="FPS";if(w.color==null||!w.color.matches("#[0-9a-fA-F]{6}"))w.color="#ffffff";}}
    public static double clamp(double v,double min,double max){return Double.isFinite(v)?Math.max(min,Math.min(max,v)):min;}
    public static void save(){sanitize();try{Files.createDirectories(CONFIG.getParent());Path tmp=CONFIG.resolveSibling("ar-client.json.tmp");Files.writeString(tmp,GSON.toJson(layout));Files.move(tmp,CONFIG,StandardCopyOption.REPLACE_EXISTING);}catch(Exception e){LOG.error("Could not save AR HUD layout",e);}}
    public static void click(int button){if(MinecraftClient.getInstance().currentScreen!=null)return;if(button==0)leftClicks.addLast(System.nanoTime());if(button==1)rightClicks.addLast(System.nanoTime());}
    private static int cps(ArrayDeque<Long> clicks){long cutoff=System.nanoTime()-1_000_000_000L;while(!clicks.isEmpty()&&clicks.peekFirst()<cutoff)clicks.removeFirst();return clicks.size();}
    public static String text(Widget w){MinecraftClient c=MinecraftClient.getInstance();if(c.player==null)return w.id;return switch(w.id){
        case "FPS"->c.getCurrentFps()+" FPS";
        case "CPS"->cps(leftClicks)+" / "+cps(rightClicks)+" CPS";
        case "Coordinates"->String.format(Locale.ROOT,"XYZ %.0f / %.0f / %.0f",c.player.getX(),c.player.getY(),c.player.getZ());
        case "Keystrokes"->(c.options.forwardKey.isPressed()?"[W]":" W ")+" "+(c.options.leftKey.isPressed()?"[A]":" A ")+" "+(c.options.backKey.isPressed()?"[S]":" S ")+" "+(c.options.rightKey.isPressed()?"[D]":" D ")+(sprintEnabled?"  Sprint":"");
        case "Ping"->{var entry=c.getNetworkHandler()==null?null:c.getNetworkHandler().getPlayerListEntry(c.player.getUuid());yield entry==null?"Ping —":entry.getLatency()+" ms";}
        case "Armor"->{StringJoiner armor=new StringJoiner(" | ");for(EquipmentSlot slot:List.of(EquipmentSlot.HEAD,EquipmentSlot.CHEST,EquipmentSlot.LEGS,EquipmentSlot.FEET)){var item=c.player.getEquippedStack(slot);if(!item.isEmpty())armor.add(item.getName().getString()+" "+(item.getMaxDamage()-item.getDamage()));}yield armor.length()==0?"No armor":armor.toString();}
        case "Potions"->{StringJoiner effects=new StringJoiner(" | ");for(var effect:c.player.getStatusEffects())effects.add(effect.getEffectType().value().getName().getString()+" "+(effect.getAmplifier()+1)+" · "+effect.getDuration()/20+"s");yield effects.length()==0?"No effects":effects.toString();}
        case "Clock"->LocalTime.now().format(DateTimeFormatter.ofPattern("HH:mm"));
        default->w.id;
    };}
    public static void render(DrawContext ctx,boolean editing){MinecraftClient c=MinecraftClient.getInstance();if(!editing&&(c.player==null||c.options.hudHidden||c.currentScreen instanceof HudEditor))return;for(Widget w:layout.widgets){if(!w.enabled)continue;String label=text(w);int x=(int)(w.x*ctx.getScaledWindowWidth()),y=(int)(w.y*ctx.getScaledWindowHeight());int rgb;try{rgb=Integer.parseInt(w.color.substring(1),16);}catch(Exception e){rgb=0xffffff;}int alpha=(int)(w.opacity*255);var matrices=ctx.getMatrices();matrices.pushMatrix();matrices.translate(x,y);matrices.scale((float)w.scale,(float)w.scale);ctx.fill(-4,-3,c.textRenderer.getWidth(label)+4,12,((int)(w.opacity*150)<<24)|0x151515);ctx.drawTextWithShadow(c.textRenderer,label,0,0,(alpha<<24)|rgb);matrices.popMatrix();}}
}
