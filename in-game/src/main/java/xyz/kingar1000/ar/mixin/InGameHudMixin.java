package xyz.kingar1000.ar.mixin;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.hud.InGameHud;
import net.minecraft.client.render.RenderTickCounter;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import xyz.kingar1000.ar.ArClient;
@Mixin(InGameHud.class)
public class InGameHudMixin {
 @Inject(method="renderCrosshair",at=@At("HEAD"),cancellable=true)
 private void ar$crosshair(DrawContext ctx,RenderTickCounter tick,CallbackInfo ci){
  var c=MinecraftClient.getInstance();var config=ArClient.layout;
  if(!config.customCrosshair||!c.options.getPerspective().isFirstPerson()||c.player==null)return;
  int x=ctx.getScaledWindowWidth()/2,y=ctx.getScaledWindowHeight()/2;
  int size=Math.max(2,Math.min(16,config.crosshairSize)),gap=Math.max(0,Math.min(10,config.crosshairGap));
  int color=0xffffffff;try{color=0xff000000|Integer.parseInt(config.crosshairColor.substring(1),16);}catch(Exception ignored){}
  ctx.fill(x-gap-size,y,x-gap,y+1,color);ctx.fill(x+gap+1,y,x+gap+size+1,y+1,color);
  ctx.fill(x,y-gap-size,x+1,y-gap,color);ctx.fill(x,y+gap+1,x+1,y+gap+size+1,color);ci.cancel();
 }
 @Inject(method="renderScoreboardSidebar(Lnet/minecraft/client/gui/DrawContext;Lnet/minecraft/client/render/RenderTickCounter;)V",at=@At("HEAD"),cancellable=true)
 private void ar$scoreboard(DrawContext ctx,RenderTickCounter tick,CallbackInfo ci){if(ArClient.layout.hideScoreboard)ci.cancel();}
}
