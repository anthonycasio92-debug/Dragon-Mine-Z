/*
 * Decompiled with CFR 0.152.
 */
package studio.magemonkey.fabled.manager;

import java.util.List;
import java.util.Map;
import java.util.Set;
import studio.magemonkey.fabled.dynamic.EffectComponent;
import studio.magemonkey.fabled.manager.FabledAttribute;

public interface IAttributeManager {
    public Map<String, FabledAttribute> getAttributes();

    public FabledAttribute getAttribute(String var1);

    public List<FabledAttribute> forStat(String var1);

    public List<FabledAttribute> forComponent(EffectComponent var1, String var2);

    public Set<String> getKeys();

    public Set<String> getLookupKeys();

    public String normalize(String var1);

    public void addByComponent(String var1, FabledAttribute var2);

    public void addByStat(String var1, FabledAttribute var2);
}

