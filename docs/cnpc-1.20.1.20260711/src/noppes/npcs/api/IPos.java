/*
 * Decompiled with CFR 0.152.
 * 
 * Could not load the following classes:
 *  net.minecraft.core.BlockPos
 */
package noppes.npcs.api;

import net.minecraft.core.BlockPos;

public interface IPos {
    public int getX();

    public int getY();

    public int getZ();

    public IPos up();

    public IPos up(int var1);

    public IPos down();

    public IPos down(int var1);

    public IPos north();

    public IPos north(int var1);

    public IPos east();

    public IPos east(int var1);

    public IPos south();

    public IPos south(int var1);

    public IPos west();

    public IPos west(int var1);

    public IPos add(int var1, int var2, int var3);

    public IPos add(IPos var1);

    public IPos subtract(int var1, int var2, int var3);

    public IPos subtract(IPos var1);

    public double[] normalize();

    public BlockPos getMCBlockPos();

    public IPos offset(int var1);

    public IPos offset(int var1, int var2);

    public double distanceTo(IPos var1);
}

