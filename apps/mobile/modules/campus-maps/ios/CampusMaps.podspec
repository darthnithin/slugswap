Pod::Spec.new do |s|
  s.name             = 'CampusMaps'
  s.version          = '1.0.0'
  s.summary          = 'Open named campus destinations in Apple Maps'
  s.description      = 'A local Expo module that opens exact campus coordinates with a descriptive destination name.'
  s.license          = { :type => 'MIT' }
  s.author           = 'darthnithin'
  s.homepage         = 'https://github.com/darthnithin/slugswap'
  s.platforms        = { :ios => '15.1' }
  s.swift_version    = '5.9'
  s.source           = { :git => 'https://github.com/darthnithin/slugswap.git' }
  s.static_framework = true
  s.source_files     = '**/*.{h,m,mm,swift,hpp,cpp}'
  s.requires_arc     = true

  s.dependency 'ExpoModulesCore'
end
