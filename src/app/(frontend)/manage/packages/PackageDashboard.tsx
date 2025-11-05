"use client";
import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, RefreshCw, AlertCircle, Sparkles, Check, Star, Crown } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

interface Package {
  id: string;
  name: string;
  description: string;
  isEnabled: boolean;
  customName?: string;
  minNights: number;
  maxNights: number;
  revenueCatId?: string;
  baseRate?: number;
  category: 'standard' | 'hosted' | 'addon' | 'special';
  multiplier: number;
  features: string[];
  entitlement?: 'standard' | 'pro';
}

interface AvailableProduct {
  id: string;
  title: string;
  description: string;
  price: number;
  currency: string;
  period: 'hour' | 'day' | 'week' | 'month' | 'year';
  periodCount: number;
  category: 'standard' | 'hosted' | 'addon' | 'special';
  features: string[];
  entitlement?: 'standard' | 'pro';
  icon?: string;
}

interface PackageDashboardProps {
  postId: string;
}

export default function PackageDashboard({ postId }: PackageDashboardProps) {
  const [packages, setPackages] = useState<Package[]>([]);
  const [availableProducts, setAvailableProducts] = useState<AvailableProduct[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadPackages = async () => {
    if (!postId) return;
    setLoading(true);
    setError(null);
    
    try {
      // Load both packages and post data
      const [packagesRes, postRes] = await Promise.all([
        fetch(`/api/packages?where[post][equals]=${postId}`),
        fetch(`/api/posts/${postId}`)
      ]);

      if (!packagesRes.ok) throw new Error('Failed to load packages');
      if (!postRes.ok) throw new Error('Failed to load post data');

      const [packagesData, postData] = await Promise.all([
        packagesRes.json(),
        postRes.json()
      ]);

      const packages = packagesData.docs || [];
      const packageSettings = postData.doc?.packageSettings || [];
      
      // Create a map of package settings by package ID
      const settingsMap = new Map();
      packageSettings.forEach((setting: any) => {
        const pkgId = typeof setting.package === 'object' ? setting.package.id : setting.package;
        settingsMap.set(pkgId, setting);
      });
      
      setPackages(
        packages.map((pkg: any) => {
          const settings = settingsMap.get(pkg.id);
          return {
            id: pkg.id,
            name: pkg.name,
            description: pkg.description,
            isEnabled: settings?.enabled ?? pkg.isEnabled ?? true,
            customName: settings?.customName || pkg.name,
            minNights: pkg.minNights,
            maxNights: pkg.maxNights,
            revenueCatId: pkg.revenueCatId,
            baseRate: pkg.baseRate,
            category: pkg.category,
            multiplier: pkg.multiplier || 1,
            features: pkg.features || [],
            entitlement: pkg.entitlement || 'standard',
          };
        })
      );
    } catch (err: any) {
      setError(err.message || 'Failed to load packages');
    } finally {
      setLoading(false);
    }
  };

  const loadAvailableProducts = async () => {
    try {
      // Fetch products from RevenueCat service via API
      const response = await fetch('/api/packages/available-products')
      if (!response.ok) {
        throw new Error('Failed to fetch available products')
      }
      
      const products = await response.json()
      setAvailableProducts(products)
      
    } catch (err: any) {
      console.error('Failed to load available products:', err)
      
      // Fallback to a minimal set if API fails
      const fallbackProducts: AvailableProduct[] = [
        {
          id: 'week_x2_customer',
          title: '🏖️ Two Week Paradise',
          description: 'Perfect for a refreshing getaway',
          price: 299.99,
          currency: 'USD',
          period: 'week',
          periodCount: 2,
          category: 'standard',
          features: ['Standard accommodation', 'Basic amenities', 'Free WiFi'],
          entitlement: 'standard',
          icon: '🏖️',
        },
        {
          id: 'per_hour_luxury',
          title: '✨ Luxury Hours',
          description: 'Premium hourly service with VIP treatment',
          price: 75.00,
          currency: 'USD',
          period: 'hour',
          periodCount: 1,
          category: 'hosted',
          features: ['Premium service', 'Enhanced amenities', 'Dedicated support', 'VIP treatment'],
          entitlement: 'pro',
          icon: '✨',
        }
      ]
      
      setAvailableProducts(fallbackProducts)
      console.warn('Using fallback products due to API error')
    }
  };

  useEffect(() => {
    loadPackages();
    loadAvailableProducts();
  }, [postId]);

  const handleToggle = (id: string) => {
    setPackages(pkgs =>
      pkgs.map(pkg =>
        pkg.id === id ? { ...pkg, isEnabled: !pkg.isEnabled } : pkg
      )
    );
  };

  const handleFieldChange = (id: string, field: keyof Package, value: any) => {
    setPackages(pkgs =>
      pkgs.map(pkg =>
        pkg.id === id ? { ...pkg, [field]: value } : pkg
      )
    );
  };

  const handleProductSelection = (productId: string) => {
    setSelectedProducts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(productId)) {
        newSet.delete(productId);
      } else {
        newSet.add(productId);
      }
      return newSet;
    });
  };

  const handleSetupProducts = async () => {
    setSyncing(true);
    setError(null);
    setSuccess(null);
    
    try {
      const res = await fetch('/api/packages/sync-revenuecat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          postId,
          selectedProducts: Array.from(selectedProducts)
        }),
      });
      
      if (!res.ok) throw new Error('Failed to setup selected packages');
      
      const result = await res.json();
      setSuccess(`Successfully setup ${result.importedPackages?.length || 0} packages!`);
      
      // Close setup and reload packages
      setShowSetup(false);
      setSelectedProducts(new Set());
      await loadPackages();
    } catch (e: any) {
      setError(e.message || 'Failed to setup packages');
    } finally {
      setSyncing(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    
    try {
      // Save each package individually
      const updatePromises = packages.map(async (pkg) => {
        // Update the package record directly
        const packageUpdateRes = await fetch(`/api/packages/${pkg.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: pkg.name,
            description: pkg.description,
            multiplier: pkg.multiplier,
            category: pkg.category,
            minNights: pkg.minNights,
            maxNights: pkg.maxNights,
            baseRate: pkg.baseRate,
            isEnabled: pkg.isEnabled,
            entitlement: pkg.entitlement,
          }),
        });
        
        if (!packageUpdateRes.ok) {
          throw new Error(`Failed to update package ${pkg.name}`);
        }
        
        return packageUpdateRes.json();
      });
      
      await Promise.all(updatePromises);
      
      // Also update the post's packageSettings for custom names
      const postUpdateRes = await fetch(`/api/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packageSettings: packages.map(pkg => ({
            package: pkg.id,
            enabled: pkg.isEnabled,
            customName: pkg.customName,
            entitlement: pkg.entitlement,
          })),
        }),
      });
      
      if (!postUpdateRes.ok) throw new Error("Failed to save package settings");
      
      setSuccess("All package changes saved successfully!");
      
      // Refresh the data to show actual saved values
      await loadPackages();
    } catch (e: any) {
      setError(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="flex items-center gap-2 py-10">
      <Loader2 className="h-5 w-5 animate-spin" />
      Loading packages...
    </div>
  );

  if (showSetup) {
    return (
      <div className="container py-10 max-w-7xl">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
              ✨ Package Setup
            </h1>
            <p className="text-lg text-gray-600 mt-2">Choose your magical experiences like selecting Disney movies</p>
          </div>
          <Button 
            onClick={() => setShowSetup(false)} 
            variant="outline"
          >
            Back to Dashboard
          </Button>
        </div>

        {error && (
          <Alert className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {availableProducts.map(product => (
            <Card 
              key={product.id}
              className={`cursor-pointer transition-all duration-300 hover:shadow-xl ${
                selectedProducts.has(product.id) 
                  ? 'ring-2 ring-purple-500 shadow-lg bg-gradient-to-br from-purple-50 to-pink-50' 
                  : 'hover:shadow-md'
              }`}
              onClick={() => handleProductSelection(product.id)}
            >
              <CardHeader className="relative">
                <div className="flex justify-between items-start">
                  <div className="text-4xl mb-2">{product.icon}</div>
                  {selectedProducts.has(product.id) && (
                    <div className="absolute top-4 right-4 bg-purple-500 text-white rounded-full p-1">
                      <Check className="h-4 w-4" />
                    </div>
                  )}
                </div>
                <CardTitle className="text-xl text-gray-800">
                  {product.title}
                </CardTitle>
                <div className="flex gap-2 flex-wrap">
                  <Badge variant={product.entitlement === 'pro' ? 'default' : 'secondary'} className="text-xs">
                    {product.entitlement === 'pro' ? (
                      <>
                        <Crown className="h-3 w-3 mr-1" />
                        Pro
                      </>
                    ) : (
                      <>
                        <Star className="h-3 w-3 mr-1" />
                        Standard
                      </>
                    )}
                  </Badge>
                  <Badge variant="outline" className="text-xs capitalize">
                    {product.category}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600 text-sm mb-3">{product.description}</p>
                <div className="text-2xl font-bold text-purple-600 mb-3">
                  ${product.price} <span className="text-sm text-gray-500">/ {product.periodCount} {product.period}{product.periodCount > 1 ? 's' : ''}</span>
                </div>
                <div className="space-y-1">
                  {product.features.slice(0, 3).map((feature, idx) => (
                    <div key={idx} className="flex items-center text-sm text-gray-600">
                      <Sparkles className="h-3 w-3 mr-2 text-purple-400" />
                      {feature}
                    </div>
                  ))}
                  {product.features.length > 3 && (
                    <div className="text-xs text-gray-400">
                      +{product.features.length - 3} more features
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex justify-center">
          <Button 
            onClick={handleSetupProducts}
            disabled={selectedProducts.size === 0 || syncing}
            size="lg"
            className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white px-8 py-3"
          >
            {syncing ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Setting up magic...
              </>
            ) : (
              <>
                <Sparkles className="h-5 w-5 mr-2" />
                Setup {selectedProducts.size} Selected Package{selectedProducts.size !== 1 ? 's' : ''}
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-10 max-w-6xl">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Manage Packages</h1>
        <Button 
          onClick={() => setShowSetup(true)} 
          variant="default"
          className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
        >
          <Sparkles className="h-4 w-4 mr-2" />
          Setup New Packages
        </Button>
      </div>
      
      {error && (
        <Alert className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      
      {success && (
        <Alert className="mb-4">
          <AlertDescription className="text-green-600">{success}</AlertDescription>
        </Alert>
      )}
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {packages.map(pkg => (
          <Card key={pkg.id} className="w-full">
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Input
                      value={pkg.name}
                      onChange={e => handleFieldChange(pkg.id, 'name', e.target.value)}
                      className="font-semibold text-lg border-none p-0 h-auto bg-transparent"
                      disabled={!pkg.isEnabled}
                    />
                    {pkg.revenueCatId && (
                      <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                        RevenueCat
                      </span>
                    )}
                  </CardTitle>
                </div>
                <Switch checked={pkg.isEnabled} onCheckedChange={() => handleToggle(pkg.id)} />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-600">Description</label>
                <Textarea
                  value={pkg.description || ""}
                  onChange={e => handleFieldChange(pkg.id, 'description', e.target.value)}
                  disabled={!pkg.isEnabled}
                  className="mt-1"
                  rows={2}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600">Category</label>
                  <Select
                    value={pkg.category || 'standard'}
                    onValueChange={value => handleFieldChange(pkg.id, 'category', value)}
                    disabled={!pkg.isEnabled}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="standard">Standard</SelectItem>
                      <SelectItem value="hosted">Hosted</SelectItem>
                      <SelectItem value="addon">Add-on</SelectItem>
                      <SelectItem value="special">Special</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <label className="text-xs font-medium text-gray-600">Entitlement</label>
                  <Select
                    value={pkg.entitlement || 'standard'}
                    onValueChange={value => handleFieldChange(pkg.id, 'entitlement', value)}
                    disabled={!pkg.isEnabled}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="standard">Standard</SelectItem>
                      <SelectItem value="pro">Pro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600">Multiplier</label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0.1"
                    max="3.0"
                    value={pkg.multiplier}
                    onChange={e => handleFieldChange(pkg.id, 'multiplier', parseFloat(e.target.value) || 1)}
                    disabled={!pkg.isEnabled}
                    className="mt-1"
                  />
                </div>
                
                <div>
                  <label className="text-xs font-medium text-gray-600">Min Nights</label>
                  <Input
                    type="number"
                    min="1"
                    value={pkg.minNights}
                    onChange={e => handleFieldChange(pkg.id, 'minNights', parseInt(e.target.value) || 1)}
                    disabled={!pkg.isEnabled}
                    className="mt-1"
                  />
                </div>
              </div>
              
              <div>
                <label className="text-xs font-medium text-gray-600">Max Nights</label>
                <Input
                  type="number"
                  min="1"
                  value={pkg.maxNights}
                  onChange={e => handleFieldChange(pkg.id, 'maxNights', parseInt(e.target.value) || 7)}
                  disabled={!pkg.isEnabled}
                  className="mt-1"
                />
              </div>
              
              <div>
                <label className="text-xs font-medium text-gray-600">Base Rate</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={pkg.baseRate || ''}
                  onChange={e => handleFieldChange(pkg.id, 'baseRate', e.target.value ? parseFloat(e.target.value) : null)}
                  disabled={!pkg.isEnabled}
                  className="mt-1"
                  placeholder="Optional base rate override"
                />
              </div>
              
              <div>
                <label className="text-xs font-medium text-gray-600">Custom Display Name</label>
                <Input
                  value={pkg.customName || ""}
                  onChange={e => handleFieldChange(pkg.id, 'customName', e.target.value)}
                  disabled={!pkg.isEnabled}
                  className="mt-1"
                  placeholder="Override display name"
                />
              </div>
              
              {pkg.revenueCatId && (
                <div className="text-xs text-gray-400 mt-1">
                  RevenueCat ID: {pkg.revenueCatId}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      
      {packages.length === 0 && (
        <div className="text-center py-16">
          <div className="text-6xl mb-4">🎬</div>
          <h3 className="text-2xl font-semibold text-gray-700 mb-2">Ready for Your First Setup?</h3>
          <p className="text-gray-500 mb-6">Create magical experiences for your guests by setting up your first packages.</p>
          <Button 
            onClick={() => setShowSetup(true)}
            size="lg"
            className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
          >
            <Sparkles className="h-5 w-5 mr-2" />
            Start Package Setup
          </Button>
        </div>
      )}
      
      {packages.length > 0 && (
        <CardFooter className="justify-end mt-6">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Save All Changes
          </Button>
        </CardFooter>
      )}
    </div>
  );
} 