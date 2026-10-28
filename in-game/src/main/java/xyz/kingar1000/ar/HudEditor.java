package xyz.kingar1000.ar;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.Click;
import net.minecraft.client.gui.widget.ButtonWidget;
import net.minecraft.text.Text;
public final class HudEditor extends Screen {
 private ArClient.Widget dragging;
 public HudEditor(){super(Text.literal("AR Client · HUD Editor"));}
 @Override protected void init(){addDrawableChild(ButtonWidget.builder(Text.literal("Save & return"),b->{ArClient.save();close();}).dimensions(width/2-70,height-30,140,20).build());}
 @Override public void render(DrawContext ctx,int mouseX,int mouseY,float delta){ctx.fill(0,0,width,height,0x99101010);ctx.drawCenteredTextWithShadow(textRenderer,"AR CLIENT / HUD EDITOR",width/2,12,0xffffffff);ctx.drawCenteredTextWithShadow(textRenderer,"Drag to move · Scroll to scale · Right-click to hide · Escape to save",width/2,27,0xffaaaaaa);ArClient.render(ctx,true);super.render(ctx,mouseX,mouseY,delta);}
 @Override public boolean mouseClicked(Click click,boolean doubled){for(ArClient.Widget w:ArClient.layout.widgets){if(!w.enabled)continue;double x=w.x*width,y=w.y*height;if(click.x()>=x-4&&click.x()<=x+(textRenderer.getWidth(ArClient.text(w))+4)*w.scale&&click.y()>=y-3&&click.y()<=y+13*w.scale){if(click.button()==1){w.enabled=false;return true;}dragging=w;return true;}}return super.mouseClicked(click,doubled);}
 @Override public boolean mouseDragged(Click click,double offsetX,double offsetY){if(dragging!=null){dragging.x=ArClient.clamp(click.x()/width,0,.95);dragging.y=ArClient.clamp(click.y()/height,0,.95);return true;}return super.mouseDragged(click,offsetX,offsetY);}
 @Override public boolean mouseReleased(Click click){dragging=null;return super.mouseReleased(click);}
 @Override public boolean mouseScrolled(double x,double y,double horizontal,double vertical){for(ArClient.Widget w:ArClient.layout.widgets){if(w.enabled&&x>=w.x*width-4&&x<=w.x*width+textRenderer.getWidth(ArClient.text(w))*w.scale+4&&y>=w.y*height-3&&y<=w.y*height+13*w.scale){w.scale=ArClient.clamp(w.scale+vertical*.1,.5,3);return true;}}return super.mouseScrolled(x,y,horizontal,vertical);}
 @Override public void close(){ArClient.save();super.close();}
 @Override public boolean shouldPause(){return false;}
}
