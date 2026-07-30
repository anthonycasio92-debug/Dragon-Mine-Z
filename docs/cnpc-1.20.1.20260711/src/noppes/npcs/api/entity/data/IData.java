/*
 * Decompiled with CFR 0.152.
 */
package noppes.npcs.api.entity.data;

public interface IData {
    public void put(String var1, Object var2);

    public Object get(String var1);

    public void remove(String var1);

    public boolean has(String var1);

    public String[] getKeys();

    public void clear();
}

